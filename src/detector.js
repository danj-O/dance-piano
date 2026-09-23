export const KEY_COUNT = 16
export const FRAME_WIDTH = 320
export const FRAME_HEIGHT = 240

export const DEFAULT_SETTINGS = Object.freeze({
  pixelThreshold: 50,
  pressThreshold: 0.16,
  cooldownMs: 300,
  zoneHeight: 0.005,
  zonePosition: 0.94,
  pixelStep: 2,
})

const LIMITS = {
  pixelThreshold: [10, 150],
  pressThreshold: [0.04, 0.6],
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

export function zoneBounds(settings, height) {
  const top = (1 - settings.zoneHeight) * settings.zonePosition
  const y1 = Math.floor(top * height)
  return {
    top,
    height: settings.zoneHeight,
    y1,
    y2: Math.min(height, Math.max(y1 + 1, Math.floor((top + settings.zoneHeight) * height))),
  }
}

// Compare with the empty floor, so a stationary foot remains occupied.
// Ratios stay comparable when sampling density or key strip height changes.
export function analyzeOccupancy(current, background, width, height, settings) {
  if (current.length !== width * height * 4 || background.length !== current.length) {
    throw new RangeError("Camera frames have different dimensions")
  }
  const { y1, y2 } = zoneBounds(settings, height)
  const ratios = new Array(KEY_COUNT).fill(0)
  for (let key = 0; key < KEY_COUNT; key++) {
    const x1 = Math.floor((key * width) / KEY_COUNT)
    const x2 = Math.floor(((key + 1) * width) / KEY_COUNT)
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
    ratios[key] = sampled ? changed / sampled : 0
  }
  return ratios
}

// Follow slow lighting changes only where the key looks empty. Never absorb a
// held foot into the floor reference.
export function adaptBackground(background, current, width, height, ratios, settings, alpha = 0.02) {
  if (current.length !== width * height * 4 || background.length !== current.length || ratios.length !== KEY_COUNT) {
    throw new RangeError("Background, frame, or key count does not match")
  }
  const { y1, y2 } = zoneBounds(settings, height)
  const emptyThreshold = settings.pressThreshold * 0.35
  for (let key = 0; key < KEY_COUNT; key++) {
    if (ratios[key] >= emptyThreshold) continue
    const x1 = Math.floor((key * width) / KEY_COUNT)
    const x2 = Math.floor(((key + 1) * width) / KEY_COUNT)
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

export class KeyTracker {
  constructor() {
    this.keys = Array.from({ length: KEY_COUNT }, () => ({ armed: true, quietFrames: 0, lastNote: -Infinity }))
  }

  update(ratios, now, settings) {
    if (ratios.length !== KEY_COUNT) throw new RangeError("Expected sixteen key ratios")
    // A change across half the floor strip is usually camera motion or lighting.
    const broadChange = ratios.filter((ratio) => ratio >= settings.pressThreshold).length >= KEY_COUNT / 2
    const triggered = []
    const releaseThreshold = settings.pressThreshold * 0.35
    for (let i = 0; i < KEY_COUNT; i++) {
      const key = this.keys[i]
      const ratio = ratios[i]
      if (key.armed) {
        if (ratio >= settings.pressThreshold) {
          key.armed = false
          key.quietFrames = 0
          if (!broadChange && now - key.lastNote >= settings.cooldownMs) {
            key.lastNote = now
            triggered.push(i)
          }
        }
      } else {
        key.quietFrames = ratio < releaseThreshold ? key.quietFrames + 1 : 0
        if (key.quietFrames >= 2) {
          key.armed = true
          key.quietFrames = 0
        }
      }
    }
    return triggered
  }
}

export function calibrationThreshold(samples) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const idle = sorted[Math.floor((sorted.length - 1) * 0.9)]
  return Math.min(0.6, Math.max(0.08, Math.ceil((idle * 2.5 + 0.05) * 100) / 100))
}
