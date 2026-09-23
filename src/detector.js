export const KEY_COUNT = 16
export const FRAME_WIDTH = 320
export const FRAME_HEIGHT = 240

export const DEFAULT_SETTINGS = Object.freeze({
  pixelThreshold: 50,
  pressThreshold: 0.16,
  cooldownMs: 300,
  zoneHeight: 0.18,
  zonePosition: 0.94,
  pixelStep: 2,
})

const LIMITS = {
  pixelThreshold: [10, 150],
  pressThreshold: [0.04, 0.60],
  cooldownMs: [100, 800],
  zoneHeight: [0.08, 0.45],
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
  return {
    top,
    height: settings.zoneHeight,
    y1: Math.floor(top * height),
    y2: Math.floor((top + settings.zoneHeight) * height),
  }
}

// Ratios stay comparable when sampling density or key strip height changes.
export function analyzeMotion(current, previous, width, height, settings) {
  if (current.length !== width * height * 4 || previous.length !== current.length) {
    throw new RangeError('Camera frames have different dimensions')
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
        const delta = Math.abs(current[p] - previous[p]) +
          Math.abs(current[p + 1] - previous[p + 1]) +
          Math.abs(current[p + 2] - previous[p + 2])
        if (delta > settings.pixelThreshold) changed++
        sampled++
      }
    }
    ratios[key] = sampled ? changed / sampled : 0
  }
  return ratios
}

export class KeyTracker {
  constructor() {
    this.keys = Array.from({ length: KEY_COUNT }, () => ({ armed: true, quietFrames: 0, lastNote: -Infinity }))
  }

  update(ratios, now, settings) {
    if (ratios.length !== KEY_COUNT) throw new RangeError('Expected sixteen key ratios')
    // A change across half the floor strip is usually camera motion or lighting.
    const broadMotion = ratios.filter((ratio) => ratio >= settings.pressThreshold).length >= KEY_COUNT / 2
    const triggered = []
    const releaseThreshold = settings.pressThreshold * 0.35
    for (let i = 0; i < KEY_COUNT; i++) {
      const key = this.keys[i]
      const ratio = ratios[i]
      if (key.armed) {
        if (!broadMotion && ratio >= settings.pressThreshold && now - key.lastNote >= settings.cooldownMs) {
          key.armed = false
          key.quietFrames = 0
          key.lastNote = now
          triggered.push(i)
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
