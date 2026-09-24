import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoneTracker, normalizeSettings } from '../src/detector.js'
import { HISTORY_LIMIT, HISTORY_WINDOW_MS } from '../src/telemetry.js'

const zones = [{ id: 'zone-a' }, { id: 'zone-b' }, { id: 'zone-c' }]
const settings = normalizeSettings({ pressThreshold: 0.2, cooldownMs: 300 })
const reading = (ratio) => zones.map(({ id }, index) => ({ zoneId: id, ratio: index === 0 ? ratio : 0 }))

test('history remains bounded by elapsed time and count', () => {
  const tracker = new ZoneTracker(zones)
  for (let time = 0; time <= 30_000; time += 100) tracker.update(reading(0), time, settings)
  const snapshot = tracker.snapshot('zone-a', 30_000)
  assert.ok(snapshot.history.length <= HISTORY_LIMIT)
  assert.ok(snapshot.history[0].at >= 30_000 - HISTORY_WINDOW_MS)
  assert.equal(snapshot.history.at(-1).at, 30_000)
  assert.equal(snapshot.inactiveMs, 30_000)
})

test('trigger, two-frame release, and elapsed idle time are recorded without changing events', () => {
  const tracker = new ZoneTracker(zones)
  tracker.update(reading(0), 500, settings)
  assert.deepEqual(tracker.update(reading(0.5), 1000, settings), [{ type: 'trigger', zoneId: 'zone-a' }])
  let snapshot = tracker.snapshot('zone-a', 1050)
  assert.equal(snapshot.triggerState, 'active')
  assert.equal(snapshot.lastTriggeredAt, 1000)
  assert.equal(snapshot.sinceTriggerMs, 50)
  assert.equal(snapshot.inactiveMs, 0)
  assert.deepEqual(tracker.update(reading(0), 1100, settings), [])
  assert.deepEqual(tracker.update(reading(0), 1200, settings), [{ type: 'release', zoneId: 'zone-a' }])
  snapshot = tracker.snapshot('zone-a', 2200)
  assert.equal(snapshot.triggerState, 'armed')
  assert.equal(snapshot.lastReleasedAt, 1200)
  assert.equal(snapshot.sinceReleaseMs, 1000)
  assert.equal(snapshot.sinceTriggerMs, 1200)
  assert.equal(snapshot.inactiveMs, 1000)
})

test('steady quantized 10% activity has zero range and variance', () => {
  const tracker = new ZoneTracker(zones)
  for (let time = 0; time < 1000; time += 100) tracker.update(reading(0.1), time, settings)
  const snapshot = tracker.snapshot('zone-a', 1000)
  assert.equal(snapshot.rawRatio, 0.1)
  assert.equal(snapshot.triggerState, 'armed')
  assert.equal(snapshot.inactiveMs, 1000)
  assert.ok(Math.abs(snapshot.recent.mean - 0.1) < 1e-12)
  assert.equal(snapshot.recent.range, 0)
  assert.ok(snapshot.recent.standardDeviation < 1e-12)
})

test('0/10% flicker differs from steady 10% and a sudden rise is visible', () => {
  const tracker = new ZoneTracker(zones)
  for (const [index, ratio] of [0, 0.1, 0, 0.1].entries()) tracker.update(reading(ratio), index * 100, settings)
  let snapshot = tracker.snapshot('zone-a', 300)
  assert.equal(snapshot.recent.mean, 0.05)
  assert.equal(snapshot.recent.range, 0.1)
  assert.equal(snapshot.recent.standardDeviation, 0.05)
  assert.ok(Math.abs(snapshot.recent.largestRise - 0.1) < 1e-12)
  assert.deepEqual(tracker.update(reading(0.5), 400, settings), [{ type: 'trigger', zoneId: 'zone-a' }])
  snapshot = tracker.snapshot('zone-a', 400)
  assert.equal(snapshot.lastDelta, 0.4)
  assert.equal(snapshot.recent.largestRise, 0.4)
})

test('a new tracker clears telemetry along with trigger state after a new reference', () => {
  let tracker = new ZoneTracker(zones)
  tracker.update(reading(0.5), 100, settings)
  tracker = new ZoneTracker(zones)
  const snapshot = tracker.snapshot('zone-a', 200)
  assert.equal(snapshot.lastTriggeredAt, null)
  assert.equal(snapshot.lastReleasedAt, null)
  assert.equal(snapshot.history.length, 0)
  assert.equal(snapshot.inactiveMs, 0)
  assert.deepEqual(tracker.update(reading(0.5), 300, settings), [{ type: 'trigger', zoneId: 'zone-a' }])
})
