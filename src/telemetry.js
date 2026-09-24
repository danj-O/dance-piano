// Ten seconds of roughly 10 Hz observations exposes sustained drift and
// quantized flicker without retaining every processed camera frame.
export const HISTORY_WINDOW_MS = 10_000
export const HISTORY_INTERVAL_MS = 100
export const HISTORY_LIMIT = 120

export class ZoneTelemetry {
  constructor() {
    this.rawRatio = 0
    this.lastDelta = 0
    this.lastTriggeredAt = null
    this.lastReleasedAt = null
    this.inactiveSince = null
    this.active = false
    this.history = []
    this.lastSampleAt = null
    this.lastObservedAt = null
  }

  record(ratio, now, active, eventType = null, pressThreshold) {
    this.lastDelta = this.lastObservedAt == null ? 0 : ratio - this.rawRatio
    this.rawRatio = ratio
    this.lastObservedAt = now
    this.active = active
    if (eventType === 'trigger') this.lastTriggeredAt = now
    if (eventType === 'release') this.lastReleasedAt = now
    // An armed zone below the press threshold is inactive even if its raw
    // reading is a steady, nonzero value such as one changed sample (10%).
    if (!active && ratio < pressThreshold) {
      if (this.inactiveSince == null) this.inactiveSince = now
    } else {
      this.inactiveSince = null
    }

    if (this.lastSampleAt == null || now - this.lastSampleAt >= HISTORY_INTERVAL_MS) {
      this.history.push({ at: now, ratio })
      this.lastSampleAt = now
    }
    while (this.history.length && (this.history[0].at < now - HISTORY_WINDOW_MS || this.history.length > HISTORY_LIMIT)) {
      this.history.shift()
    }
  }

  snapshot(now) {
    const ratios = this.history.map(({ ratio }) => ratio)
    const count = ratios.length
    const mean = count ? ratios.reduce((sum, ratio) => sum + ratio, 0) / count : 0
    const minimum = count ? Math.min(...ratios) : 0
    const maximum = count ? Math.max(...ratios) : 0
    const variance = count ? ratios.reduce((sum, ratio) => sum + (ratio - mean) ** 2, 0) / count : 0
    let largestRise = 0
    for (let index = 1; index < count; index++) largestRise = Math.max(largestRise, ratios[index] - ratios[index - 1])
    return {
      rawRatio: this.rawRatio,
      triggerState: this.active ? 'active' : 'armed',
      lastTriggeredAt: this.lastTriggeredAt,
      lastReleasedAt: this.lastReleasedAt,
      sinceTriggerMs: this.lastTriggeredAt == null ? null : Math.max(0, now - this.lastTriggeredAt),
      sinceReleaseMs: this.lastReleasedAt == null ? null : Math.max(0, now - this.lastReleasedAt),
      inactiveMs: this.inactiveSince == null ? 0 : Math.max(0, now - this.inactiveSince),
      lastDelta: this.lastDelta,
      recent: { mean, minimum, maximum, range: maximum - minimum, standardDeviation: Math.sqrt(variance), largestRise, count },
      history: this.history.map((sample) => ({ ...sample })),
    }
  }
}
