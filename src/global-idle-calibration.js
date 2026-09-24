import { effectiveAdaptationCeiling } from './local-adaptation.js'
import { GLOBAL_IDLE_CALIBRATION, LOCAL_ADAPTATION } from './detection-policy.js'

export { GLOBAL_IDLE_CALIBRATION }

export class GlobalIdleCalibration {
  constructor(zones, config = GLOBAL_IDLE_CALIBRATION) {
    this.zoneIds = zones.map(({ id }) => id)
    if (new Set(this.zoneIds).size !== this.zoneIds.length || !this.zoneIds.length) {
      throw new RangeError('Global calibration requires unique zones')
    }
    this.config = config
    this.reset()
  }

  reset() {
    this.state = 'normal'
    this.reason = null
    this.idleSince = null
    this.verifyingSince = null
    this.refreshSince = null
    this.lastDecisionAt = null
    this.lastUnsafeAt = null
    this.lastSuccessAt = null
    this.clearSince = null
    this.armed = true
    this.didBlend = false
    this.driftCount = 0
    this.activeCount = 0
    this.highCount = 0
    this.unstableCount = 0
    this.requiredDriftCount = Math.max(this.config.minimumDriftZones,
      Math.ceil(this.zoneIds.length * this.config.driftZoneFraction))
  }

  suspendsLocal() {
    return this.state === 'candidate' || this.state === 'verifying' || this.state === 'refreshing'
  }

  snapshot(now) {
    return {
      state: this.state,
      reason: this.reason,
      driftCount: this.driftCount,
      activeCount: this.activeCount,
      highCount: this.highCount,
      unstableCount: this.unstableCount,
      requiredDriftCount: this.requiredDriftCount,
      idleMs: this.idleSince == null ? 0 : Math.max(0, now - this.idleSince),
      idleDwellMs: this.config.idleDwellMs,
      verificationMs: this.verifyingSince == null ? 0 : Math.max(0, now - this.verifyingSince),
      verificationDwellMs: this.config.verificationDwellMs,
      refreshMs: this.refreshSince == null ? 0 : Math.max(0, now - this.refreshSince),
      cooldownMs: this.lastSuccessAt == null ? 0 : Math.max(0,
        this.config.postRefreshCooldownMs - (now - this.lastSuccessAt)),
      clearMs: this.clearSince == null ? 0 : Math.max(0, now - this.clearSince),
      clearDwellMs: this.config.clearDwellMs,
    }
  }

  update(measurements, tracker, now, settings) {
    if (measurements.length !== this.zoneIds.length) throw new RangeError('Expected one measurement per zone')
    const before = this.suspendsLocal()
    const cfg = this.config
    const noise = Math.min(LOCAL_ADAPTATION.noiseCeiling,
      settings.pressThreshold * LOCAL_ADAPTATION.noisePressFraction)
    const ceiling = Math.min(effectiveAdaptationCeiling(settings),
      settings.pressThreshold * cfg.maximumPressFraction)
    const stableRange = Math.min(cfg.maximumStableRange,
      Math.max(cfg.minimumStableRange, ceiling * cfg.stableRangeFraction))
    const alphaByZone = new Map()
    let completed = false
    let activeCount = 0
    let highCount = 0
    let recentInteractionCount = 0
    let unstableCount = 0
    let historyReady = true
    let broadDrift = 0

    for (let index = 0; index < measurements.length; index++) {
      const { zoneId, ratio } = measurements[index]
      if (zoneId !== this.zoneIds[index]) throw new RangeError('Measurements do not match zones')
      const data = tracker.snapshot(zoneId, now)
      const recentInteraction = [data.lastTriggeredAt, data.lastReleasedAt]
        .some((at) => at != null && now - at < cfg.interactionQuietMs)
      const history = data.history.filter(({ at }) => at >= now - cfg.historyWindowMs)
      const values = history.map(({ ratio: value }) => value)
      values.push(ratio)
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const maximum = Math.max(...values)
      const range = maximum - Math.min(...values)
      const span = history.length < 2 ? 0 : history.at(-1).at - history[0].at
      const active = data.triggerState === 'active'
      const high = ratio > ceiling || maximum > ceiling
      const unstable = this.state === 'refreshing'
        ? data.lastDelta > stableRange
        : range > stableRange || data.lastDelta > stableRange
      if (mean > noise && !active && !high && !recentInteraction && !unstable) broadDrift++
      if (span < cfg.minimumHistorySpanMs) historyReady = false
      if (active) activeCount++
      if (high) highCount++
      if (recentInteraction) recentInteractionCount++
      // During refresh ratios should fall as the baseline catches up; only
      // a new upward jump counts as movement at that point.
      if (unstable) unstableCount++
    }
    this.driftCount = broadDrift
    this.activeCount = activeCount
    this.highCount = highCount
    this.unstableCount = unstableCount
    let reason = null
    if (activeCount) reason = 'ACTIVE ZONE'
    else if (highCount) reason = 'HIGH OCCUPANCY'
    else if (recentInteractionCount) reason = 'RECENT INTERACTION'
    else if (unstableCount) reason = this.state === 'refreshing' ? 'SCENE MOVEMENT' : 'UNSTABLE SCENE'

    if (!this.armed) {
      if (!reason && broadDrift < this.requiredDriftCount) {
        if (this.clearSince == null) this.clearSince = now
      } else {
        this.clearSince = null
      }
      if (this.lastSuccessAt != null && now - this.lastSuccessAt >= cfg.postRefreshCooldownMs
        && this.clearSince != null && now - this.clearSince >= cfg.clearDwellMs) {
        this.armed = true
        this.state = 'normal'
      } else {
        this.state = 'cooldown'
      }
      this.reason = null
    } else if (reason) {
      this.lastUnsafeAt = now
      this.state = 'blocked'
      this.reason = reason
      this.idleSince = null
      this.verifyingSince = null
      this.refreshSince = null
      this.didBlend = false
    } else if (this.lastUnsafeAt != null && now - this.lastUnsafeAt < cfg.suspiciousQuietMs) {
      this.state = 'blocked'
      this.reason = 'SETTLING AFTER MOVEMENT'
      this.idleSince = null
      this.verifyingSince = null
      this.refreshSince = null
    } else if (this.state !== 'refreshing' && !historyReady) {
      this.state = 'waiting'
      this.reason = 'COLLECTING HISTORY'
      this.idleSince = null
      this.verifyingSince = null
    } else if (this.state !== 'refreshing' && broadDrift < this.requiredDriftCount) {
      this.state = 'normal'
      this.reason = null
      this.idleSince = null
      this.verifyingSince = null
    } else {
      this.reason = null
      if (this.state === 'refreshing') {
        if (now - this.refreshSince >= cfg.refreshDurationMs) {
          if (this.didBlend) {
            this.lastSuccessAt = now
            this.armed = false
            this.clearSince = null
            this.state = 'cooldown'
            completed = true
          } else {
            this.state = 'normal'
          }
          this.idleSince = null
          this.verifyingSince = null
          this.refreshSince = null
          this.didBlend = false
        } else {
          const elapsed = this.lastDecisionAt == null ? 0 : Math.max(0, now - this.lastDecisionAt)
          const alpha = 1 - Math.exp(-Math.min(elapsed, cfg.maximumBlendIntervalMs)
            / cfg.refreshTimeConstantMs)
          if (alpha > 0) {
            for (const { zoneId, ratio } of measurements) {
              if (ratio > noise) alphaByZone.set(zoneId, alpha)
            }
            if (alphaByZone.size) this.didBlend = true
          }
        }
      } else if (this.state === 'verifying') {
        if (now - this.verifyingSince >= cfg.verificationDwellMs) {
          this.state = 'refreshing'
          this.refreshSince = now
          this.didBlend = false
        }
      } else {
        if (this.idleSince == null) this.idleSince = now
        if (now - this.idleSince >= cfg.idleDwellMs) {
          this.state = 'verifying'
          this.verifyingSince = now
        } else {
          this.state = 'candidate'
        }
      }
    }
    this.lastDecisionAt = now
    return {
      alphaByZone,
      suspendLocal: this.suspendsLocal(),
      resetLocal: before !== this.suspendsLocal(),
      completed,
    }
  }
}
