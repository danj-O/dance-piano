// Initial conservative values. Tune against real camera traces before widening
// the eligible range or shortening the guards.
export const LOCAL_ADAPTATION = Object.freeze({
  noiseCeiling: 0.02,
  noisePressFraction: 0.2,
  maximumActivity: 0.45,
  maximumPressFraction: 0.75,
  stabilityWindowMs: 2000,
  minimumStableSpanMs: 1500,
  minimumStableRange: 0.06,
  maximumStableRange: 0.2,
  stableRangeFraction: 0.7,
  minimumActiveFraction: 0.65,
  normalDwellMs: 600,
  candidateDwellMs: 4000,
  postInteractionGraceMs: 3000,
  sharpRiseMinimum: 0.06,
  sharpRiseMaximum: 0.12,
  sharpRiseRangeFraction: 0.5,
  sharpRiseHoldMs: 2000,
  baselineTimeConstantMs: 2500,
  maximumBlendIntervalMs: 100,
  completionDwellMs: 600,
  completionFlashMs: 900,
})

export function effectiveAdaptationCeiling(settings, config = LOCAL_ADAPTATION) {
  return Math.min(settings.adaptationCeiling ?? config.maximumActivity, config.maximumActivity,
    settings.pressThreshold * config.maximumPressFraction)
}

export class LocalAdaptation {
  constructor(zones, config = LOCAL_ADAPTATION) {
    this.config = config
    this.zones = new Map(zones.map((zone) => [zone.id, {
      state: 'normal', candidateSince: null, adaptingSince: null,
      lastSharpRiseAt: null, lastDecisionAt: null, normalSince: null,
      recentRange: 0, blending: false, recoverySince: null,
      adaptationStartActivity: 0, recoveryProgress: 0,
      hadBlended: false, completedAt: null,
    }]))
    if (this.zones.size !== zones.length) throw new RangeError('Zone IDs must be unique')
  }

  snapshot(zoneId, now) {
    const zone = this.zones.get(zoneId)
    if (!zone) throw new RangeError(`Unknown zone: ${zoneId}`)
    const { candidateDwellMs, completionFlashMs } = this.config
    return {
      state: zone.state,
      blending: zone.blending,
      candidateMs: zone.candidateSince == null ? 0 : Math.max(0, now - zone.candidateSince),
      candidateDwellMs,
      adaptingMs: zone.adaptingSince == null ? 0 : Math.max(0, now - zone.adaptingSince),
      recoveryProgress: zone.recoveryProgress,
      completeMs: zone.completedAt == null ? 0 : Math.max(0, now - zone.completedAt),
      completionFlashMs,
      recentRange: zone.recentRange,
      graceMs: zone.graceUntil == null ? 0 : Math.max(0, zone.graceUntil - now),
    }
  }

  update(measurements, tracker, now, settings) {
    if (measurements.length !== this.zones.size) throw new RangeError('Expected one measurement per zone')
    const cfg = this.config
    const noise = Math.min(cfg.noiseCeiling, settings.pressThreshold * cfg.noisePressFraction)
    const maximum = effectiveAdaptationCeiling(settings, cfg)
    const toleratedRange = Math.min(cfg.maximumStableRange,
      Math.max(cfg.minimumStableRange, maximum * cfg.stableRangeFraction))
    const sharpRise = Math.min(cfg.sharpRiseMaximum,
      Math.max(cfg.sharpRiseMinimum, toleratedRange * cfg.sharpRiseRangeFraction))
    const alphaByZone = new Map()

    for (const { zoneId, ratio } of measurements) {
      const zone = this.zones.get(zoneId)
      if (!zone) throw new RangeError(`Unknown zone: ${zoneId}`)
      zone.blending = false
      const telemetry = tracker.snapshot(zoneId, now)
      const elapsed = zone.lastDecisionAt == null ? 0 : Math.max(0, now - zone.lastDecisionAt)
      zone.lastDecisionAt = now

      const recentInteraction = [telemetry.lastTriggeredAt, telemetry.lastReleasedAt]
        .filter((at) => at != null)
      zone.graceUntil = recentInteraction.length ? Math.max(...recentInteraction) + cfg.postInteractionGraceMs : null
      const samples = telemetry.history.filter(({ at }) => at >= now - cfg.stabilityWindowMs)
      const values = samples.map(({ ratio: value }) => value)
      values.push(ratio) // Include the current frame even between sampled observations.
      zone.recentRange = Math.max(...values) - Math.min(...values)
      const recentMaximum = Math.max(...values)
      const recentMean = values.reduce((sum, value) => sum + value, 0) / values.length
      const activeFraction = values.filter((value) => value > noise).length / values.length
      const stableSpan = samples.length < 2 ? 0 : samples.at(-1).at - samples[0].at
      const previousValues = samples.filter(({ at }) => at < now).map(({ ratio: value }) => value)
      // Compare a new peak with the recent envelope, not the previous frame:
      // a camera can alternate 10–20% inside a settled band without motion.
      if (previousValues.length >= 2 && ratio - Math.max(...previousValues) > sharpRise) {
        zone.lastSharpRiseAt = now
      }
      if (ratio <= noise) {
        if (zone.normalSince == null) zone.normalSince = now
      } else {
        zone.normalSince = null
      }

      const setState = (state, abandonRecovery = false) => {
        zone.state = state
        zone.candidateSince = null
        zone.adaptingSince = null
        if (abandonRecovery) {
          zone.hadBlended = false
          zone.recoverySince = null
          zone.recoveryProgress = 0
        }
      }
      if (telemetry.triggerState === 'active' || ratio > maximum) {
        setState('occupied', true)
        continue
      }
      if (zone.graceUntil != null && now < zone.graceUntil) {
        setState('grace', true)
        continue
      }
      if (recentMean <= noise || (zone.normalSince != null && now - zone.normalSince >= cfg.normalDwellMs)) {
        if (zone.hadBlended) {
          if (zone.recoverySince == null) zone.recoverySince = now
          if (now - zone.recoverySince >= cfg.completionDwellMs) {
            zone.completedAt = now
            zone.hadBlended = false
            zone.recoveryProgress = 1
            setState('complete')
          } else {
            zone.state = 'recovering'
          }
        } else if (zone.completedAt != null && now - zone.completedAt < cfg.completionFlashMs) {
          zone.state = 'complete'
        } else {
          setState('normal')
        }
        continue
      }
      zone.recoverySince = null
      if (zone.lastSharpRiseAt != null && now - zone.lastSharpRiseAt < cfg.sharpRiseHoldMs) {
        setState('unstable', true)
        continue
      }

      if (recentMaximum > maximum) {
        setState('unstable')
        continue
      }

      // Once blending has started, a falling active fraction is evidence that
      // the reference may be catching up. Pause blending and wait for a
      // sustained return to normal instead of restarting the candidate bar.
      if (zone.hadBlended && activeFraction < cfg.minimumActiveFraction) {
        zone.state = 'recovering'
        continue
      }
      if (zone.recentRange > toleratedRange || activeFraction < cfg.minimumActiveFraction) {
        setState('unstable')
        continue
      }
      if (stableSpan < cfg.minimumStableSpanMs) {
        setState('settling')
        continue
      }

      if (zone.candidateSince == null) zone.candidateSince = now
      if (now - zone.candidateSince < cfg.candidateDwellMs) {
        zone.state = 'candidate'
        continue
      }
      if (zone.adaptingSince == null) {
        zone.adaptingSince = now
        zone.adaptationStartActivity = Math.max(recentMean, noise + 0.001)
        zone.recoveryProgress = 0
      }
      zone.state = 'adapting'
      zone.recoveryProgress = Math.max(zone.recoveryProgress,
        Math.max(0, Math.min(1, (zone.adaptationStartActivity - recentMean) / (zone.adaptationStartActivity - noise))))
      const interval = Math.min(elapsed, cfg.maximumBlendIntervalMs)
      const alpha = 1 - Math.exp(-interval / cfg.baselineTimeConstantMs)
      if (alpha > 0 && ratio > noise) {
        alphaByZone.set(zoneId, alpha)
        zone.blending = true
        zone.hadBlended = true
      }
    }
    return alphaByZone
  }
}
