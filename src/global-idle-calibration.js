import { LOCAL_ADAPTATION, effectiveAdaptationCeiling } from './local-adaptation.js'

// Global refresh deliberately needs broad, quiet evidence. These values are
// independent of the per-zone candidate and blend timings.
export const GLOBAL_IDLE_CALIBRATION = Object.freeze({
  historyWindowMs: 2000,
  minimumHistorySpanMs: 1500,
  idleDwellMs: 5000,
  verificationDwellMs: 4000,
  interactionQuietMs: 5000,
  suspiciousQuietMs: 2000,
  driftZoneFraction: 0.5,
  maximumPressFraction: 0.5,
  maximumStableRange: 0.06,
  stableRangeFraction: 0.5,
  minimumStableRange: 0.03,
  refreshTimeConstantMs: 800,
  refreshDurationMs: 2500,
  maximumBlendIntervalMs: 100,
  postRefreshCooldownMs: 20_000,
  clearDwellMs: 2000,
})

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
    this.requiredDriftCount = Math.max(2, Math.ceil(this.zoneIds.length * this.config.driftZoneFraction))
  }

  suspendsLocal() {
    return this.state === 'candidate' || this.state === 'verifying' || this.state === 'refreshing'
  }

  snapshot(now) {
    return {
      state: this.state,
      reason: this.reason,
      driftCount: this.driftCount,
      requiredDriftCount: this.requiredDriftCount,
      idleMs: this.idleSince == null ? 0 : Math.max(0, now - this.idleSince),
      idleDwellMs: this.config.idleDwellMs,
      verificationMs: this.verifyingSince == null ? 0 : Math.max(0, now - this.verifyingSince),
      verificationDwellMs: this.config.verificationDwellMs,
      refreshMs: this.refreshSince == null ? 0 : Math.max(0, now - this.refreshSince),
      cooldownMs: this.lastSuccessAt == null ? 0 : Math.max(0,
        this.config.postRefreshCooldownMs - (now - this.lastSuccessAt)),
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
    let reason = null
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
      if (mean > noise) broadDrift++
      if (span < cfg.minimumHistorySpanMs) historyReady = false
      if (data.triggerState === 'active') reason ??= 'ACTIVE ZONE'
      else if (ratio > ceiling || maximum > ceiling) reason ??= 'HIGH OCCUPANCY'
      else if (recentInteraction) reason ??= 'RECENT INTERACTION'
      else if (this.state === 'refreshing') {
        // Ratios should fall as the baseline changes; a new upward jump is
        // suspicious, but that expected downward range is not.
        if (data.lastDelta > stableRange) reason ??= 'SCENE MOVEMENT'
      } else if (range > stableRange || data.lastDelta > stableRange) {
        reason ??= 'UNSTABLE SCENE'
      }
    }
    this.driftCount = broadDrift

    if (!this.armed) {
      if (broadDrift < this.requiredDriftCount) {
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
