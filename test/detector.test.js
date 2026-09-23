import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KEY_COUNT, KeyTracker, analyzeMotion, calibrationThreshold,
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
})

test('motion is assigned to the correct key and normalized by sample count', () => {
  const before = blank()
  const after = blank()
  for (let y = 12; y < 16; y++) {
    for (let x = 4; x < 6; x++) after[(y * 32 + x) * 4] = 100
  }
  const full = analyzeMotion(after, before, 32, 16, settings)
  const sparse = analyzeMotion(after, before, 32, 16, { ...settings, pixelStep: 2 })
  assert.equal(full[2], 1)
  assert.equal(sparse[2], 1)
  assert.equal(full.filter(Boolean).length, 1)
})

test('one sustained step produces one note until two quiet frames rearm it', () => {
  const tracker = new KeyTracker()
  const step = quiet(); step[4] = 0.5
  assert.deepEqual(tracker.update(step, 0, settings), [4])
  assert.deepEqual(tracker.update(step, 350, settings), [])
  assert.deepEqual(tracker.update(quiet(), 400, settings), [])
  assert.deepEqual(tracker.update(step, 450, settings), [])
  tracker.update(quiet(), 500, settings)
  tracker.update(quiet(), 550, settings)
  assert.deepEqual(tracker.update(step, 600, settings), [4])
})

test('cooldown and broad-motion suppression block false retriggers', () => {
  const tracker = new KeyTracker()
  const step = quiet(); step[0] = 0.5
  tracker.update(step, 0, settings)
  tracker.update(quiet(), 50, settings)
  tracker.update(quiet(), 100, settings)
  assert.deepEqual(tracker.update(step, 150, settings), [])
  assert.deepEqual(tracker.update(Array(KEY_COUNT).fill(0.8), 400, settings), [])
  assert.deepEqual(tracker.update(step, 450, settings), [0])
})

test('settings and calibration handle stale or noisy saved values', () => {
  const value = normalizeSettings({ pixelThreshold: 999, zoneHeight: -1, pixelStep: 2.7, pressThreshold: 'oops' })
  assert.equal(value.pixelThreshold, 150)
  assert.equal(value.zoneHeight, 0.08)
  assert.equal(value.pixelStep, 3)
  assert.equal(value.pressThreshold, 0.16)
  assert.equal(calibrationThreshold([0, 0.01, 0.02, 0.03, 1]), 0.13)
  assert.equal(calibrationThreshold([]), null)
})
