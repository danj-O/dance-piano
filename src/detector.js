import { ZoneTelemetry } from './telemetry.js?v=local-adaptation'

export const FRAME_WIDTH = 320
export const FRAME_HEIGHT = 240

export const DEFAULT_SETTINGS = Object.freeze({
  pixelThreshold: 50,
  pressThreshold: 0.30,
  adaptationCeiling: 0.12,
  cooldownMs: 300,
  zoneHeight: 0.005,
  zonePosition: 0.94,
  pixelStep: 2,
})

const LIMITS = {
  pixelThreshold: [10, 150],
  pressThreshold: [0.04, 0.6],
  adaptationCeiling: [0.02, 0.45],
  cooldownMs: [100, 800],
  zoneHeight: [0.005, 0.45],
  zonePosition: [0, 1],
  pixelStep: [1, 5],
}

export function normalizeSettings(value = {}) {
  const result = { ...DEFAULT_SETTINGS }
  for (const [name, [min, max]] of Object.entries(LIMITS)) {
    const candidate = Number(value[name])
    if (value[name] != null && Number.isFinite(candidate)) {
      result[name] = Math.min(max, Math.max(min, candidate))
    }
  }
  result.pixelStep = Math.round(result.pixelStep)
  return result
}

export function zonePixelBounds(geometry, width, height) {
  const x1 = Math.floor(geometry.x * width)
  const y1 = Math.floor(geometry.y * height)
  return {
    x1,
    x2: Math.floor((geometry.x + geometry.width) * width),
    y1,
    y2: Math.min(height, Math.max(y1 + 1, Math.floor((geometry.y + geometry.height) * height))),
  }
}

// Compare with the empty floor, so a stationary foot remains occupied.
// Ratios stay comparable when sampling density or zone height changes.
export function measureZones(current, background, width, height, zones, settings) {
  if (current.length !== width * height * 4 || background.length !== current.length) {
    throw new RangeError("Camera frames have different dimensions")
  }
  return zones.map((zone) => {
    const { x1, x2, y1, y2 } = zonePixelBounds(zone.geometry, width, height)
    let changed = 0
    let sampled = 0
    for (let y = y1; y < y2; y += settings.pixelStep) {
      for (let x = x1; x < x2; x += settings.pixelStep) {
        const p = (y * width + x) * 4
        const delta =
          Math.abs(current[p] - background[p]) +
          Math.abs(current[p + 1] - background[p + 1]) +
          Math.abs(current[p + 2] - background[p + 2])
        if (delta > settings.pixelThreshold) changed++
        sampled++
      }
    }
    return { zoneId: zone.id, ratio: sampled ? changed / sampled : 0 }
  })
}

// Blend only zones approved by the active calibration controller.
// The full-frame Float32Array remains shared across nonoverlapping zones.
export function adaptBackground(background, current, width, height, zones, alphaByZone) {
  if (current.length !== width * height * 4 || background.length !== current.length) {
    throw new RangeError("Background and frame dimensions do not match")
  }
  for (const zone of zones) {
    const alpha = alphaByZone.get(zone.id) ?? 0
    if (alpha <= 0) continue
    const { x1, x2, y1, y2 } = zonePixelBounds(zone.geometry, width, height)
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const p = (y * width + x) * 4
        for (let channel = 0; channel < 3; channel++) {
          background[p + channel] += (current[p + channel] - background[p + channel]) * alpha
        }
      }
    }
  }
}

export class ZoneTracker {
  constructor(zones) {
    this.states = new Map(zones.map((zone) => [zone.id, { armed: true, quietFrames: 0, lastNote: -Infinity }]))
    if (this.states.size !== zones.length) throw new RangeError('Zone IDs must be unique')
    this.telemetry = new Map(zones.map((zone) => [zone.id, new ZoneTelemetry()]))
  }

  snapshot(zoneId, now) {
    const telemetry = this.telemetry.get(zoneId)
    if (!telemetry) throw new RangeError(`Unknown zone: ${zoneId}`)
    return telemetry.snapshot(now)
  }

  update(measurements, now, settings) {
    if (measurements.length !== this.states.size) throw new RangeError('Expected one measurement per zone')
    // Preserve the default piano's half-of-zones broad-change guard.
    const broadChange = measurements.filter(({ ratio }) => ratio >= settings.pressThreshold).length >= measurements.length / 2
    const events = []
    const releaseThreshold = settings.pressThreshold * 0.35
    for (const { zoneId, ratio } of measurements) {
      const state = this.states.get(zoneId)
      if (!state) throw new RangeError(`Unknown zone: ${zoneId}`)
      let eventType = null
      if (state.armed) {
        if (ratio >= settings.pressThreshold) {
          state.armed = false
          state.quietFrames = 0
          if (!broadChange && now - state.lastNote >= settings.cooldownMs) {
            state.lastNote = now
            events.push({ type: 'trigger', zoneId })
            eventType = 'trigger'
          }
        }
      } else {
        state.quietFrames = ratio < releaseThreshold ? state.quietFrames + 1 : 0
        if (state.quietFrames >= 2) {
          state.armed = true
          state.quietFrames = 0
          events.push({ type: 'release', zoneId })
          eventType = 'release'
        }
      }
      this.telemetry.get(zoneId).record(ratio, now, !state.armed, eventType, settings.pressThreshold)
    }
    return events
  }
}
