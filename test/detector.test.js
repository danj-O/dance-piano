import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoneTracker, adaptBackground, measureZones, calibrationThreshold, normalizeSettings, zonePixelBounds } from '../src/detector.js'
import { createDefaultLayout, generateZones } from '../src/layout.js'
import { DEFAULT_MUSIC } from '../src/music.js'

const settings = normalizeSettings({ pixelThreshold: 40, pressThreshold: 0.2, zoneHeight: 0.25, zonePosition: 1, pixelStep: 1 })
const zones = generateZones(createDefaultLayout(settings, DEFAULT_MUSIC))
const blank = () => new Uint8ClampedArray(32 * 16 * 4)
const quiet = () => zones.map(({ id }) => ({ zoneId: id, ratio: 0 }))
const event = (type, index) => ({ type, zoneId: zones[index].id })

test('zone geometry stays inside the camera frame', () => {
  assert.deepEqual(zonePixelBounds(zones[0].geometry, 32, 16), { x1: 0, x2: 2, y1: 12, y2: 16 })
  const upper = generateZones(createDefaultLayout(normalizeSettings({ zoneHeight: 0.2, zonePosition: 0 }), DEFAULT_MUSIC))
  assert.equal(zonePixelBounds(upper[0].geometry, 320, 100).y1, 0)
  assert.equal(zonePixelBounds(upper[0].geometry, 320, 100).y2, 20)
  const thin = generateZones(createDefaultLayout(normalizeSettings({ zoneHeight: 0.005, zonePosition: 1 }), DEFAULT_MUSIC))
  assert.equal(zonePixelBounds(thin[0].geometry, 320, 240).y1, 238)
  assert.equal(zonePixelBounds(thin[0].geometry, 320, 240).y2, 240)
})

test('floor differences are assigned to the correct zone and normalized by sample count', () => {
  const before = blank()
  const after = blank()
  for (let y = 12; y < 16; y++) for (let x = 4; x < 6; x++) after[(y * 32 + x) * 4] = 100
  const full = measureZones(after, before, 32, 16, zones, settings)
  const sparse = measureZones(after, before, 32, 16, zones, { ...settings, pixelStep: 2 })
  assert.equal(full[2].ratio, 1)
  assert.equal(sparse[2].ratio, 1)
  assert.equal(full.filter(({ ratio }) => ratio > 0).length, 1)
})

test('measurement accepts arbitrary supplied rectangular geometry', () => {
  const current = blank()
  current[(3 * 32 + 21) * 4] = 100
  const rectangle = [{ id: 'area', geometry: { x: 20 / 32, y: 2 / 16, width: 4 / 32, height: 4 / 16 } }]
  assert.deepEqual(measureZones(current, blank(), 32, 16, rectangle, settings), [{ zoneId: 'area', ratio: 1 / 16 }])
})

test('entry triggers once, a held foot stays occupied, and exit releases then rearms', () => {
  const tracker = new ZoneTracker(zones)
  const floor = blank()
  const foot = blank()
  for (let y = 12; y < 16; y++) for (let x = 8; x < 10; x++) foot[(y * 32 + x) * 4] = 100
  const reference = new Float32Array(floor)
  const present = measureZones(foot, reference, 32, 16, zones, settings)
  assert.equal(present[4].ratio, 1)
  assert.deepEqual(tracker.update(present, 0, settings), [event('trigger', 4)])
  for (const time of [100, 350, 600]) {
    assert.deepEqual(tracker.update(measureZones(foot, reference, 32, 16, zones, settings), time, settings), [])
    adaptBackground(reference, foot, 32, 16, zones, new Map())
  }
  assert.equal(reference[(12 * 32 + 8) * 4], 0, 'held foot must not become the background')
  const empty = measureZones(floor, reference, 32, 16, zones, settings)
  assert.equal(empty[4].ratio, 0)
  assert.deepEqual(tracker.update(empty, 700, settings), [])
  assert.deepEqual(tracker.update(empty, 750, settings), [event('release', 4)])
  assert.deepEqual(tracker.update(present, 800, settings), [event('trigger', 4)])
})

test('empty floor reference follows gradual brightness changes', () => {
  const reference = new Float32Array(blank())
  const brighter = blank()
  brighter[(12 * 32 + 8) * 4] = 20
  const measurements = measureZones(brighter, reference, 32, 16, zones, settings)
  assert.equal(measurements[4].ratio, 0)
  adaptBackground(reference, brighter, 32, 16, zones, new Map([[zones[4].id, 0.5]]))
  assert.equal(reference[(12 * 32 + 8) * 4], 10)
})

test('cooldown and broad changes suppress an entry without delaying its note', () => {
  const tracker = new ZoneTracker(zones)
  const step = quiet(); step[0].ratio = 0.5
  assert.deepEqual(tracker.update(step, 0, settings), [event('trigger', 0)])
  tracker.update(quiet(), 50, settings)
  assert.deepEqual(tracker.update(quiet(), 100, settings), [event('release', 0)])
  assert.deepEqual(tracker.update(step, 150, settings), [])
  assert.deepEqual(tracker.update(step, 350, settings), [])
  tracker.update(quiet(), 360, settings)
  tracker.update(quiet(), 370, settings)
  const broad = quiet().map((reading) => ({ ...reading, ratio: 0.8 }))
  assert.deepEqual(tracker.update(broad, 400, settings), [])
  assert.deepEqual(tracker.update(step, 450, settings), [])
  tracker.update(quiet(), 500, settings)
  tracker.update(quiet(), 550, settings)
  assert.deepEqual(tracker.update(step, 600, settings), [event('trigger', 0)])
})

test('settings and calibration handle stale or noisy saved values', () => {
  const value = normalizeSettings({ pixelThreshold: 999, zoneHeight: -1, pixelStep: 2.7, pressThreshold: 'oops' })
  assert.equal(value.pixelThreshold, 150)
  assert.equal(value.zoneHeight, 0.005)
  assert.equal(value.pixelStep, 3)
  assert.equal(value.pressThreshold, 0.16)
  assert.equal(value.adaptationCeiling, 0.12)
  assert.equal(normalizeSettings({ adaptationCeiling: 0.05 }).adaptationCeiling, 0.05)
  assert.equal(normalizeSettings({ adaptationCeiling: 999 }).adaptationCeiling, 0.45)
  assert.equal(calibrationThreshold([0, 0.01, 0.02, 0.03, 1]), 0.13)
  assert.equal(calibrationThreshold([]), null)
})
