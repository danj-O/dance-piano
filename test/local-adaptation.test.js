import test from 'node:test'
import assert from 'node:assert/strict'
import { ZoneTracker, DEFAULT_SETTINGS, adaptBackground, measureZones, normalizeSettings } from '../src/detector.js'
import { LocalAdaptation, LOCAL_ADAPTATION, effectiveAdaptationCeiling } from '../src/local-adaptation.js'

const zones = Array.from({ length: 3 }, (_, index) => ({
  id: `zone-${index}`,
  geometry: { x: index / 3, y: 0, width: 1 / 3, height: 1 },
}))
const settings = normalizeSettings({ pixelThreshold: 40, pressThreshold: 0.2, adaptationCeiling: 0.15, pixelStep: 1 })
const readings = (a = 0, b = 0, c = 0) => [a, b, c].map((ratio, index) => ({ zoneId: zones[index].id, ratio }))
const setup = () => ({ tracker: new ZoneTracker(zones), local: new LocalAdaptation(zones) })
function step(system, time, a = 0, b = 0, c = 0, selectedSettings = settings) {
  const values = readings(a, b, c)
  const events = system.tracker.update(values, time, selectedSettings)
  const alpha = system.local.update(values, system.tracker, time, selectedSettings)
  return { events, alpha, state: system.local.snapshot(zones[0].id, time) }
}

test('zero and ordinary low noise stay normal without baseline blending', () => {
  const system = setup()
  for (let time = 0; time <= 8000; time += 100) {
    const result = step(system, time, time % 200 ? 0.01 : 0)
    assert.equal(result.state.state, 'normal')
    assert.equal(result.alpha.size, 0)
  }
})

test('stable low drift becomes a candidate, waits its dwell, then adapts', () => {
  const system = setup()
  let candidateAt = null
  let adaptingAt = null
  for (let time = 0; time <= 8000; time += 100) {
    const result = step(system, time, 0.05)
    if (result.state.state === 'candidate' && candidateAt == null) candidateAt = time
    if (result.state.state === 'adapting' && adaptingAt == null) adaptingAt = time
    if (result.state.state === 'candidate') assert.equal(result.alpha.size, 0)
  }
  assert.ok(candidateAt >= LOCAL_ADAPTATION.minimumStableSpanMs)
  assert.ok(adaptingAt >= candidateAt + LOCAL_ADAPTATION.candidateDwellMs)
  assert.ok(system.local.snapshot(zones[0].id, 8000).adaptingMs > 0)
})

test('a stable 10% bucket remains eligible below the default press threshold', () => {
  const system = setup()
  let adapted = false
  for (let time = 0; time <= 7000; time += 100) {
    const values = readings(0.1)
    system.tracker.update(values, time, DEFAULT_SETTINGS)
    adapted ||= system.local.update(values, system.tracker, time, DEFAULT_SETTINGS).has(zones[0].id)
  }
  assert.ok(adapted)
})

test('a persistent 5% bucket can recover with an 8% calibrated press threshold', () => {
  const system = setup()
  const calibrated = normalizeSettings({ pressThreshold: 0.08 })
  let adapted = false
  for (let time = 0; time <= 7000; time += 100) {
    const values = readings(0.05)
    system.tracker.update(values, time, calibrated)
    adapted ||= system.local.update(values, system.tracker, time, calibrated).has(zones[0].id)
  }
  assert.ok(adapted)
})

test('brief 3/4/3/0/4% flicker retains candidate dwell and eventually adapts', () => {
  const system = setup()
  const selected = normalizeSettings({ pressThreshold: 0.08, adaptationCeiling: 0.05 })
  const pattern = [0.03, 0.04, 0.03, 0, 0.04]
  let candidateAt = null
  let adaptingAt = null
  let sawZeroDuringCandidate = false
  let sawPausedZeroDuringAdaptation = false
  for (let time = 0; time <= 9000; time += 100) {
    const ratio = pattern[(time / 100) % pattern.length]
    const result = step(system, time, ratio, 0, 0, selected)
    if (result.state.state === 'candidate') {
      candidateAt ??= time
      if (ratio === 0) {
        sawZeroDuringCandidate = true
        assert.ok(result.state.candidateMs >= 0)
      }
    }
    if (result.state.state === 'adapting') {
      adaptingAt ??= time
      if (ratio === 0) {
        sawPausedZeroDuringAdaptation = true
        assert.equal(result.alpha.size, 0)
        assert.equal(result.state.blending, false)
      } else {
        assert.ok(result.alpha.has(zones[0].id))
      }
    }
  }
  assert.ok(candidateAt != null && adaptingAt >= candidateAt + LOCAL_ADAPTATION.candidateDwellMs)
  assert.ok(sawZeroDuringCandidate)
  assert.ok(sawPausedZeroDuringAdaptation)
})

test('a fluctuating 10–20% drift band completes the wait when below the chosen ceiling', () => {
  const system = setup()
  const selected = normalizeSettings({ pressThreshold: 0.32, adaptationCeiling: 0.24 })
  const pattern = [0.1, 0.15, 0.2, 0.12, 0.17]
  let candidateAt = null
  let adaptingAt = null
  for (let time = 0; time <= 9000; time += 100) {
    const result = step(system, time, pattern[(time / 100) % pattern.length], 0, 0, selected)
    assert.deepEqual(result.events, [])
    if (result.state.state === 'candidate') candidateAt ??= time
    if (result.state.state === 'adapting') adaptingAt ??= time
  }
  assert.ok(candidateAt >= LOCAL_ADAPTATION.minimumStableSpanMs)
  assert.ok(adaptingAt >= candidateAt + LOCAL_ADAPTATION.candidateDwellMs)
})

test('intermittent zero and high readings do not qualify as a sustained drift band', () => {
  const system = setup()
  const selected = normalizeSettings({ pressThreshold: 0.32, adaptationCeiling: 0.24 })
  for (let time = 0; time <= 9000; time += 100) {
    const result = step(system, time, time % 200 ? 0.1 : 0, 0, 0, selected)
    assert.equal(result.alpha.size, 0)
  }
})

test('the configured activity ceiling blocks values above the selected percent', () => {
  const system = setup()
  const selected = normalizeSettings({ pressThreshold: 0.08, adaptationCeiling: 0.03 })
  for (let time = 0; time <= 9000; time += 100) {
    const result = step(system, time, 0.04, 0, 0, selected)
    assert.equal(result.state.state, 'occupied')
    assert.equal(result.alpha.size, 0)
  }
})

test('the chosen ceiling remains below a calibrated press threshold', () => {
  assert.equal(effectiveAdaptationCeiling(normalizeSettings({
    pressThreshold: 0.08, adaptationCeiling: 0.15,
  })), 0.06)
})

test('eligible drift gradually changes only its zone baseline and reduces activity', () => {
  const system = setup()
  const reference = new Float32Array(60 * 4)
  const current = new Uint8ClampedArray(60 * 4)
  current[4] = 80 // One of twenty pixels in zone 0: persistent 5% activity.
  let firstBlendAt = null
  let firstNormalAt = null
  let recovering = false
  let completed = false
  for (let time = 0; time <= 16_000; time += 100) {
    const values = measureZones(current, reference, 60, 1, zones, settings)
    system.tracker.update(values, time, settings)
    const alpha = system.local.update(values, system.tracker, time, settings)
    if (alpha.size && firstBlendAt == null) firstBlendAt = time
    adaptBackground(reference, current, 60, 1, zones, alpha)
    if (firstBlendAt != null && values[0].ratio === 0 && firstNormalAt == null) firstNormalAt = time
    const state = system.local.snapshot(zones[0].id, time)
    if (state.state === 'recovering') recovering = true
    if (state.state === 'complete') {
      completed = true
      assert.equal(state.recoveryProgress, 1)
    }
  }
  assert.ok(firstBlendAt >= LOCAL_ADAPTATION.minimumStableSpanMs + LOCAL_ADAPTATION.candidateDwellMs)
  assert.ok(reference[4] > 0 && reference[4] < 80)
  assert.equal(reference[24 * 4], 0, 'unrelated zone baseline remains unchanged')
  assert.ok(firstNormalAt != null && firstNormalAt < 10_000,
    'persistent low difference should clear promptly after the guarded dwell')
  assert.ok(recovering, 'falling activity should keep recovery visible')
  assert.ok(completed, 'recovered drift should produce a completion signal')
  assert.equal(system.local.snapshot(zones[0].id, 16_000).state, 'normal')
})

test('high occupancy stays frozen indefinitely and a triggered zone cannot adapt', () => {
  const system = setup()
  const reference = new Float32Array(60 * 4)
  const current = new Uint8ClampedArray(60 * 4)
  for (let x = 0; x < 16; x++) current[x * 4] = 100 // 80% occupancy.
  for (let time = 0; time <= 20_000; time += 100) {
    const values = measureZones(current, reference, 60, 1, zones, settings)
    const events = system.tracker.update(values, time, settings)
    if (time === 0) assert.deepEqual(events, [{ type: 'trigger', zoneId: zones[0].id }])
    const alpha = system.local.update(values, system.tracker, time, settings)
    assert.equal(alpha.has(zones[0].id), false)
    adaptBackground(reference, current, 60, 1, zones, alpha)
  }
  assert.equal(reference[0], 0)
  assert.equal(system.local.snapshot(zones[0].id, 20_000).state, 'occupied')
})

test('activity above the local ceiling freezes even before the press threshold', () => {
  const system = setup()
  for (let time = 0; time <= 12_000; time += 100) {
    const result = step(system, time, 0.16)
    assert.deepEqual(result.events, [])
    assert.equal(result.state.state, 'occupied')
    assert.equal(result.alpha.size, 0)
  }
})

test('release freezes adaptation for a timed grace, then candidacy can resume', () => {
  const system = setup()
  assert.deepEqual(step(system, 0, 0.8).events, [{ type: 'trigger', zoneId: zones[0].id }])
  step(system, 100, 0)
  assert.deepEqual(step(system, 200, 0).events, [{ type: 'release', zoneId: zones[0].id }])
  for (let time = 300; time < 3200; time += 100) {
    const result = step(system, time, 0.05)
    assert.equal(result.state.state, 'grace')
    assert.equal(result.alpha.size, 0)
  }
  let becameCandidate = false
  let becameAdapting = false
  for (let time = 3200; time <= 9000; time += 100) {
    const result = step(system, time, 0.05)
    becameCandidate ||= result.state.state === 'candidate'
    becameAdapting ||= result.state.state === 'adapting'
  }
  assert.ok(becameCandidate)
  assert.ok(becameAdapting)
})

test('a sudden sub-trigger rise cancels candidacy and unstable low activity never adapts', () => {
  const system = setup()
  for (let time = 0; time <= 3500; time += 100) step(system, time, 0.05)
  assert.equal(system.local.snapshot(zones[0].id, 3500).state, 'candidate')
  const jump = step(system, 3600, 0.14)
  assert.equal(jump.events.length, 0)
  assert.equal(jump.state.state, 'unstable')
  assert.equal(jump.alpha.size, 0)
  for (let time = 3700; time <= 12_000; time += 100) {
    const result = step(system, time, time % 200 ? 0.1 : 0)
    assert.equal(result.alpha.size, 0)
  }
  assert.notEqual(system.local.snapshot(zones[0].id, 12_000).state, 'adapting')
})

test('a sudden rise stops an already adapting zone immediately', () => {
  const system = setup()
  for (let time = 0; time <= 7000; time += 100) step(system, time, 0.05)
  assert.equal(system.local.snapshot(zones[0].id, 7000).state, 'adapting')
  const jump = step(system, 7100, 0.14)
  assert.equal(jump.state.state, 'unstable')
  assert.equal(jump.alpha.size, 0)
  const after = step(system, 7200, 0.05)
  assert.equal(after.alpha.size, 0)
  assert.equal(after.state.state, 'unstable')
})

test('zones decide independently and a new reference resets their adaptation state', () => {
  let system = setup()
  for (let time = 0; time <= 7000; time += 100) step(system, time, 0.05, 0.8, 0)
  assert.equal(system.local.snapshot(zones[0].id, 7000).state, 'adapting')
  assert.equal(system.local.snapshot(zones[1].id, 7000).state, 'occupied')
  assert.equal(system.local.snapshot(zones[2].id, 7000).state, 'normal')
  system = setup() // Same reset performed after a new camera reference.
  assert.equal(system.local.snapshot(zones[0].id, 7100).state, 'normal')
  assert.equal(system.local.snapshot(zones[0].id, 7100).candidateMs, 0)
})
