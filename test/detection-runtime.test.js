import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptBackground, measureZones, normalizeSettings } from '../src/detector.js'
import { DetectionRuntime } from '../src/detection-runtime.js'

const zones = Array.from({ length: 4 }, (_, index) => ({
  id: `zone-${index}`,
  geometry: { x: index / 4, y: 0, width: 0.25, height: 1 },
}))
const settings = normalizeSettings({ pixelThreshold: 40, pixelStep: 1 })
const readings = (ratios) => ratios.map((ratio, index) => ({ zoneId: zones[index].id, ratio }))
function tick(runtime, now, ratios) {
  const values = readings(ratios)
  const events = runtime.tracker.update(values, now, settings)
  const alpha = runtime.updateCalibration(values, now, settings)
  return { events, alpha, state: runtime.global.snapshot(now) }
}

test('combined runtime preserves trigger, hold, release, cooldown, and broad suppression', () => {
  const runtime = new DetectionRuntime(zones)
  assert.deepEqual(tick(runtime, 0, [0, 0, 0, 0]).events, [])
  assert.deepEqual(tick(runtime, 100, [0.8, 0, 0, 0]).events,
    [{ type: 'trigger', zoneId: 'zone-0' }])
  assert.deepEqual(tick(runtime, 200, [0.8, 0, 0, 0]).events, [])
  assert.deepEqual(tick(runtime, 300, [0, 0, 0, 0]).events, [])
  assert.deepEqual(tick(runtime, 400, [0, 0, 0, 0]).events,
    [{ type: 'release', zoneId: 'zone-0' }])
  assert.deepEqual(tick(runtime, 500, [0.8, 0, 0, 0]).events,
    [{ type: 'trigger', zoneId: 'zone-0' }])
  tick(runtime, 600, [0, 0, 0, 0])
  tick(runtime, 700, [0, 0, 0, 0])
  assert.deepEqual(tick(runtime, 800, [0.8, 0.8, 0.8, 0.8]).events, [])
  assert.equal(runtime.global.snapshot(800).state, 'blocked')
})

test('one drifting zone adapts locally while stationary occupancy blocks global refresh', () => {
  const runtime = new DetectionRuntime(zones)
  let localBlended = false
  for (let now = 0; now <= 9000; now += 100) {
    const result = tick(runtime, now, [0.08, 0.8, 0, 0])
    localBlended ||= result.alpha.has('zone-0')
    assert.equal(result.alpha.has('zone-1'), false)
    assert.equal(result.state.state, 'blocked')
    assert.equal(result.state.driftCount, 1)
  }
  assert.ok(localBlended)
})

test('broad drift pauses local updates through verification and refresh, then resets history', () => {
  const runtime = new DetectionRuntime(zones)
  const reference = new Float32Array(80 * 4)
  const current = new Uint8ClampedArray(80 * 4)
  current[4] = 100
  current[21 * 4] = 100
  let candidate = false
  let verifying = false
  let refreshing = false
  let completed = false
  for (let now = 0; now <= 16_000; now += 100) {
    const values = measureZones(current, reference, 80, 1, zones, settings)
    runtime.tracker.update(values, now, settings)
    const alpha = runtime.updateCalibration(values, now, settings)
    const state = runtime.global.snapshot(now)
    if (state.state === 'candidate') candidate = true
    if (state.state === 'verifying') verifying = true
    if (state.state === 'refreshing') refreshing = true
    if (state.state === 'candidate' || state.state === 'verifying') {
      assert.equal(alpha.size, 0)
      assert.equal(runtime.local.snapshot('zone-0', now).state, 'normal')
    }
    adaptBackground(reference, current, 80, 1, zones, alpha)
    if (state.state === 'cooldown') {
      completed = true
      assert.equal(runtime.tracker.snapshot('zone-0', now).history.length, 0)
      assert.equal(runtime.local.snapshot('zone-0', now).state, 'normal')
      break
    }
  }
  assert.ok(candidate && verifying && refreshing && completed)
  assert.ok(reference[4] > 0 && reference[21 * 4] > 0)
  assert.equal(reference[41 * 4], 0)
})

test('movement during a global refresh cancels it before any further baseline write', () => {
  const runtime = new DetectionRuntime(zones)
  for (let now = 0; now <= 11_100; now += 100) tick(runtime, now, [0.08, 0.08, 0, 0])
  assert.equal(runtime.global.snapshot(11_100).state, 'refreshing')
  const moving = tick(runtime, 11_200, [0.8, 0.08, 0, 0])
  assert.equal(moving.state.state, 'blocked')
  assert.equal(moving.alpha.size, 0)
  assert.equal(runtime.local.snapshot('zone-0', 11_200).state, 'occupied')
  assert.equal(tick(runtime, 11_300, [0.8, 0.08, 0, 0]).alpha.size, 0)
})

test('global candidacy takes control cleanly when a zone was already adapting locally', () => {
  const runtime = new DetectionRuntime(zones)
  for (let now = 0; now <= 7000; now += 100) tick(runtime, now, [0.08, 0, 0, 0])
  assert.equal(runtime.local.snapshot('zone-0', 7000).state, 'adapting')
  let candidateAt = null
  for (let now = 7100; now <= 15_000; now += 100) {
    const result = tick(runtime, now, [0.08, 0.08, 0, 0])
    if (result.state.state === 'candidate') {
      candidateAt = now
      assert.equal(result.alpha.size, 0)
      assert.equal(runtime.local.snapshot('zone-0', now).state, 'normal')
      break
    }
  }
  assert.ok(candidateAt != null)
})

test('manual and new-camera reference reset every temporal controller', () => {
  const runtime = new DetectionRuntime(zones)
  for (let now = 0; now <= 8000; now += 100) tick(runtime, now, [0.08, 0.08, 0, 0])
  assert.equal(runtime.global.snapshot(8000).state, 'verifying')
  runtime.reset() // Same method used on manual capture and camera lifecycle.
  assert.equal(runtime.global.snapshot(8000).state, 'normal')
  assert.equal(runtime.tracker.snapshot('zone-0', 8000).history.length, 0)
  assert.equal(runtime.local.snapshot('zone-0', 8000).state, 'normal')
  tick(runtime, 8100, [0.08, 0.08, 0, 0])
  assert.equal(runtime.global.snapshot(8100).state, 'waiting')
  runtime.reset()
  assert.equal(runtime.global.snapshot(8200).state, 'normal')
})

test('global eligibility uses low safe zones, not occupied keys or unstable activity', () => {
  const runtime = new DetectionRuntime(zones)
  const allOccupied = tick(runtime, 0, [0.8, 0.8, 0.8, 0.8])
  assert.equal(allOccupied.state.driftCount, 0)
  assert.equal(allOccupied.state.activeCount, 4)
  assert.equal(allOccupied.state.state, 'blocked')
  runtime.reset()
  const lowWithOneHigh = tick(runtime, 100, [0.08, 0.08, 0.16, 0])
  assert.equal(lowWithOneHigh.state.driftCount, 2)
  assert.equal(lowWithOneHigh.state.highCount, 1)
  assert.equal(lowWithOneHigh.state.state, 'blocked')
})

test('local and global dwell gates follow elapsed time across common frame intervals', () => {
  const timings = []
  for (const frameMs of [33, 100, 200]) {
    const localRuntime = new DetectionRuntime(zones)
    const globalRuntime = new DetectionRuntime(zones)
    let localBlendAt = null
    let globalCandidateAt = null
    let globalVerifyAt = null
    let globalRefreshAt = null
    for (let now = 0; now <= 12_000; now += frameMs) {
      const local = tick(localRuntime, now, [0.08, 0, 0, 0])
      const global = tick(globalRuntime, now, [0.08, 0.08, 0, 0])
      if (local.alpha.size && localBlendAt == null) localBlendAt = now
      if (global.state.state === 'candidate' && globalCandidateAt == null) globalCandidateAt = now
      if (global.state.state === 'verifying' && globalVerifyAt == null) globalVerifyAt = now
      if (global.state.state === 'refreshing' && globalRefreshAt == null) globalRefreshAt = now
    }
    timings.push({ localBlendAt, globalCandidateAt, globalVerifyAt, globalRefreshAt })
  }
  for (const key of Object.keys(timings[0])) {
    const values = timings.map((timing) => timing[key])
    assert.ok(values.every((value) => value != null), `${key} must occur at every tested frame interval`)
    assert.ok(Math.max(...values) - Math.min(...values) <= 300,
      `${key} must not vary by more than a frame plus telemetry spacing`)
  }
})
