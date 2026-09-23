import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KEY_COUNT, KeyTracker, adaptBackground, analyzeOccupancy, calibrationThreshold,
  normalizeSettings, zoneBounds,
} from '../src/detector.js'

const settings = normalizeSettings({ pixelThreshold: 40, pressThreshold: 0.2, zoneHeight: 0.25, zonePosition: 1, pixelStep: 1 })
const blank = () => new Uint8ClampedArray(32 * 16 * 4)
const quiet = () => Array(KEY_COUNT).fill(0)

test('zone geometry stays inside the camera frame', () => {
  assert.deepEqual(zoneBounds(settings, 16), { top: 0.75, height: 0.25, y1: 12, y2: 16 })
  const upper = zoneBounds(normalizeSettings({ zoneHeight: 0.2, zonePosition: 0 }), 100)
  assert.equal(upper.y1, 0)
  assert.equal(upper.y2, 20)
  const thin = zoneBounds(normalizeSettings({ zoneHeight: 0.005, zonePosition: 1 }), 240)
  assert.equal(thin.y1, 238)
  assert.equal(thin.y2, 240)
})

test('floor differences are assigned to the correct key and normalized by sample count', () => {
  const before = blank()
  const after = blank()
  for (let y = 12; y < 16; y++) {
    for (let x = 4; x < 6; x++) after[(y * 32 + x) * 4] = 100
  }
  const full = analyzeOccupancy(after, before, 32, 16, settings)
  const sparse = analyzeOccupancy(after, before, 32, 16, { ...settings, pixelStep: 2 })
  assert.equal(full[2], 1)
  assert.equal(sparse[2], 1)
  assert.equal(full.filter(Boolean).length, 1)
})

test('entry plays once, a held foot stays occupied, and exit only rearms', () => {
  const tracker = new KeyTracker()
  const floor = blank()
  const foot = blank()
  for (let y = 12; y < 16; y++) {
    for (let x = 8; x < 10; x++) foot[(y * 32 + x) * 4] = 100
  }
  const reference = new Float32Array(floor)
  const present = analyzeOccupancy(foot, reference, 32, 16, settings)
  assert.equal(present[4], 1)
  assert.deepEqual(tracker.update(present, 0, settings), [4])
  for (const time of [100, 350, 600]) {
    assert.deepEqual(tracker.update(analyzeOccupancy(foot, reference, 32, 16, settings), time, settings), [])
    adaptBackground(reference, foot, 32, 16, present, settings)
  }
  assert.equal(reference[(12 * 32 + 8) * 4], 0, 'held foot must not become the background')
  const empty = analyzeOccupancy(floor, reference, 32, 16, settings)
  assert.equal(empty[4], 0)
  assert.deepEqual(tracker.update(empty, 700, settings), [])
  assert.deepEqual(tracker.update(empty, 750, settings), [])
  assert.deepEqual(tracker.update(present, 800, settings), [4])
})

test('empty floor reference follows gradual brightness changes', () => {
  const reference = new Float32Array(blank())
  const brighter = blank()
  brighter[(12 * 32 + 8) * 4] = 20
  const ratios = analyzeOccupancy(brighter, reference, 32, 16, settings)
  assert.equal(ratios[4], 0)
  adaptBackground(reference, brighter, 32, 16, ratios, settings, 0.5)
  assert.equal(reference[(12 * 32 + 8) * 4], 10)
})

test('cooldown and broad changes suppress an entry without delaying its note', () => {
  const tracker = new KeyTracker()
  const step = quiet(); step[0] = 0.5
  tracker.update(step, 0, settings)
  tracker.update(quiet(), 50, settings)
  tracker.update(quiet(), 100, settings)
  assert.deepEqual(tracker.update(step, 150, settings), [])
  assert.deepEqual(tracker.update(step, 350, settings), [])
  tracker.update(quiet(), 360, settings)
  tracker.update(quiet(), 370, settings)
  assert.deepEqual(tracker.update(Array(KEY_COUNT).fill(0.8), 400, settings), [])
  assert.deepEqual(tracker.update(step, 450, settings), [])
  tracker.update(quiet(), 500, settings)
  tracker.update(quiet(), 550, settings)
  assert.deepEqual(tracker.update(step, 600, settings), [0])
})

test('settings and calibration handle stale or noisy saved values', () => {
  const value = normalizeSettings({ pixelThreshold: 999, zoneHeight: -1, pixelStep: 2.7, pressThreshold: 'oops' })
  assert.equal(value.pixelThreshold, 150)
  assert.equal(value.zoneHeight, 0.005)
  assert.equal(value.pixelStep, 3)
  assert.equal(value.pressThreshold, 0.16)
  assert.equal(calibrationThreshold([0, 0.01, 0.02, 0.03, 1]), 0.13)
  assert.equal(calibrationThreshold([]), null)
})
