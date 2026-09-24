import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoneTracker, adaptBackground, measureZones, normalizeSettings } from '../src/detector.js'
import { LocalAdaptation, LOCAL_ADAPTATION } from '../src/local-adaptation.js'
import { GlobalIdleCalibration, GLOBAL_IDLE_CALIBRATION } from '../src/global-idle-calibration.js'

const zones = Array.from({ length: 4 }, (_, index) => ({
  id: `zone-${index}`,
  geometry: { x: index / 4, y: 0, width: 0.25, height: 1 },
}))
const settings = normalizeSettings({ pixelThreshold: 40, pixelStep: 1 })
const readings = (ratios) => ratios.map((ratio, index) => ({ zoneId: zones[index].id, ratio }))
const setup = () => ({ tracker: new ZoneTracker(zones), global: new GlobalIdleCalibration(zones) })
function step(system, now, ratios = [0.08, 0.08, 0, 0], selected = settings) {
  const values = readings(ratios)
  const events = system.tracker.update(values, now, selected)
  return { ...system.global.update(values, system.tracker, now, selected), events,
    state: system.global.snapshot(now) }
}
function run(system, start, end, ratios = [0.08, 0.08, 0, 0]) {
  let result
  for (let now = start; now <= end; now += 100) result = step(system, now, ratios)
  return result
}

test('stable broad low drift waits through idle and verification before refresh', () => {
  const system = setup()
  let candidateAt, verifyingAt, refreshingAt, firstBlendAt
  for (let now = 0; now <= 14_000; now += 100) {
    const result = step(system, now)
    assert.deepEqual(result.events, [])
    if (result.state.state === 'candidate') candidateAt ??= now
    if (result.state.state === 'verifying') verifyingAt ??= now
    if (result.state.state === 'refreshing') refreshingAt ??= now
    if (result.alphaByZone.size) firstBlendAt ??= now
    if (now < 10_000) assert.equal(result.alphaByZone.size, 0)
  }
  assert.ok(candidateAt >= GLOBAL_IDLE_CALIBRATION.minimumHistorySpanMs)
  assert.ok(verifyingAt >= candidateAt + GLOBAL_IDLE_CALIBRATION.idleDwellMs)
  assert.ok(refreshingAt >= verifyingAt + GLOBAL_IDLE_CALIBRATION.verificationDwellMs)
  assert.ok(firstBlendAt > refreshingAt)
})

test('zero, noise, and isolated local drift never start a global candidate', () => {
  for (const ratios of [[0, 0, 0, 0], [0.01, 0.01, 0, 0], [0.08, 0, 0, 0]]) {
    const system = setup()
    const result = run(system, 0, 15_000, ratios)
    assert.equal(result.state.state, 'normal')
    assert.equal(result.alphaByZone.size, 0)
  }
})

test('active keys and stationary high occupancy veto the entire global scene', () => {
  for (const ratios of [[0.8, 0.08, 0.08, 0], [0.16, 0.08, 0.08, 0]]) {
    const system = setup()
    const result = run(system, 0, 20_000, ratios)
    assert.equal(result.state.state, 'blocked')
    assert.equal(result.alphaByZone.size, 0)
    assert.equal(result.state.reason, ratios[0] === 0.8 ? 'ACTIVE ZONE' : 'HIGH OCCUPANCY')
  }
})

test('a trigger and release each veto the next global idle window', () => {
  const system = setup()
  step(system, 0, [0.8, 0, 0, 0])
  assert.equal(step(system, 100, [0, 0, 0, 0]).state.state, 'blocked')
  assert.equal(step(system, 200, [0, 0, 0, 0]).events[0].type, 'release')
  const after = run(system, 300, 5000)
  assert.equal(after.state.state, 'blocked')
  assert.equal(after.state.reason, 'RECENT INTERACTION')
  assert.equal(step(system, 5100).state.state, 'blocked', 'a fresh quiet period follows the veto')
  assert.equal(run(system, 5200, 7600).state.state, 'candidate')
})

test('unstable low activity cancels candidacy and requires new stable history', () => {
  const system = setup()
  assert.equal(run(system, 0, 4000).state.state, 'candidate')
  const jump = step(system, 4100, [0.01, 0.08, 0, 0])
  assert.equal(jump.state.state, 'blocked')
  assert.equal(jump.alphaByZone.size, 0)
  assert.equal(step(system, 4200).state.state, 'blocked')
  assert.equal(run(system, 4300, 8500).state.state, 'candidate')
})

test('sudden activity during verification cancels it', () => {
  const system = setup()
  assert.equal(run(system, 0, 8000).state.state, 'verifying')
  const result = step(system, 8100, [0.8, 0.08, 0, 0])
  assert.equal(result.state.state, 'blocked')
  assert.equal(result.alphaByZone.size, 0)
  assert.equal(result.state.verificationMs, 0)
})

test('activity during refresh aborts further blending', () => {
  const system = setup()
  assert.equal(run(system, 0, 11_000).state.state, 'refreshing')
  assert.ok(step(system, 11_100).alphaByZone.size > 0)
  const result = step(system, 11_200, [0.8, 0.08, 0, 0])
  assert.equal(result.state.state, 'blocked')
  assert.equal(result.alphaByZone.size, 0)
  assert.equal(step(system, 11_300).alphaByZone.size, 0)
})

test('global blend is faster than local, touches qualifying zones, and completes', () => {
  const system = setup()
  const reference = new Float32Array(80 * 4)
  const current = new Uint8ClampedArray(80 * 4)
  current[4] = 100
  current[21 * 4] = 100
  let completed = false
  let firstAlpha = null
  for (let now = 0; now <= 16_000; now += 100) {
    const values = measureZones(current, reference, 80, 1, zones, settings)
    system.tracker.update(values, now, settings)
    const result = system.global.update(values, system.tracker, now, settings)
    if (result.alphaByZone.size && firstAlpha == null) firstAlpha = result.alphaByZone.get(zones[0].id)
    adaptBackground(reference, current, 80, 1, zones, result.alphaByZone)
    completed ||= result.completed
    if (completed) break
  }
  const localAlpha = 1 - Math.exp(-100 / LOCAL_ADAPTATION.baselineTimeConstantMs)
  assert.ok(firstAlpha > localAlpha)
  assert.ok(reference[4] > 0 && reference[21 * 4] > 0)
  assert.equal(reference[41 * 4], 0)
  assert.ok(completed)
  assert.equal(system.global.snapshot(16_000).state, 'cooldown')
})

test('global handoff resets local temporal state and completion calls for tracker reset', () => {
  const system = setup()
  let local = new LocalAdaptation(zones)
  let sawHandoff = false
  let completed = false
  for (let now = 0; now <= 15_000; now += 100) {
    const values = readings([0.08, 0.08, 0, 0])
    system.tracker.update(values, now, settings)
    const result = system.global.update(values, system.tracker, now, settings)
    if (result.resetLocal) {
      local = new LocalAdaptation(zones)
      sawHandoff = true
    }
    if (!result.suspendLocal) local.update(values, system.tracker, now, settings)
    if (result.completed) {
      system.tracker = new ZoneTracker(zones)
      local = new LocalAdaptation(zones)
      completed = true
      break
    }
  }
  assert.ok(sawHandoff && completed)
  assert.equal(local.snapshot(zones[0].id, 15_000).state, 'normal')
  assert.equal(system.tracker.snapshot(zones[0].id, 15_000).history.length, 0)
})

test('successful refresh needs cooldown and drift clearance before rearming', () => {
  const system = setup()
  assert.equal(run(system, 0, 15_000).state.state, 'cooldown')
  assert.equal(run(system, 15_100, 40_000).state.state, 'cooldown')
  assert.equal(run(system, 40_100, 44_500, [0, 0, 0, 0]).state.state, 'normal')
  assert.equal(run(system, 44_600, 50_000).state.state, 'candidate')
})

test('manual and camera reference lifecycle reset global runtime state', () => {
  const system = setup()
  assert.equal(run(system, 0, 8000).state.state, 'verifying')
  system.global.reset() // Manual calibration start.
  assert.equal(system.global.snapshot(8000).state, 'normal')
  assert.equal(system.global.snapshot(8000).idleMs, 0)
  system.tracker = new ZoneTracker(zones)
  system.global.reset() // New camera/reference.
  assert.equal(step(system, 8100).state.state, 'waiting')
})

test('ordinary isolated Phase 2B adaptation remains available', () => {
  const system = setup()
  const local = new LocalAdaptation(zones)
  let blended = false
  for (let now = 0; now <= 8000; now += 100) {
    const values = readings([0.08, 0, 0, 0])
    system.tracker.update(values, now, settings)
    const global = system.global.update(values, system.tracker, now, settings)
    assert.equal(global.suspendLocal, false)
    blended ||= local.update(values, system.tracker, now, settings).size > 0
  }
  assert.ok(blended)
})
