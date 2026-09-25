import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultLayout, createMixedDemoLayout, generateZones } from '../src/layout.js'
import { dispatchZoneEvent } from '../src/actions.js'
import { adaptBackground, measureZones, normalizeSettings, ZoneTracker } from '../src/detector.js'
import { DetectionRuntime } from '../src/detection-runtime.js'
import { DEFAULT_MUSIC } from '../src/music.js'

const settings = normalizeSettings({ zoneHeight: 0.2, zonePosition: 1, pixelStep: 1 })
const classic = generateZones(createDefaultLayout(settings, DEFAULT_MUSIC))
const mixed = generateZones(createMixedDemoLayout(settings, DEFAULT_MUSIC))
const values = (zones, activity = {}) => zones.map(({ id }) => ({ zoneId: id, ratio: activity[id] ?? 0 }))

function tick(runtime, now, activity = {}) {
  const measurements = values(mixed, activity)
  const events = runtime.tracker.update(measurements, now, settings)
  const alpha = runtime.updateCalibration(measurements, now, settings)
  return { events, alpha, global: runtime.global.snapshot(now) }
}

test('mixed camera frame measures independent keyboard and trigger rectangles', () => {
  const width = 100
  const height = 100
  const background = new Float32Array(width * height * 4)
  const current = new Uint8ClampedArray(width * height * 4)
  for (let y = 38; y < 58; y++) for (let x = 78; x < 92; x++) current[(y * width + x) * 4] = 100
  for (let y = 80; y < 100; y++) for (let x = 0; x < 6; x++) current[(y * width + x) * 4] = 100
  const measured = measureZones(current, background, width, height, mixed, settings)
  assert.equal(measured[0].ratio, 1)
  assert.equal(measured[16].ratio, 1)
  assert.equal(measured[17].ratio, 0)
  assert.equal(measured.filter(({ ratio }) => ratio > 0).length, 2)
  adaptBackground(background, current, width, height, mixed, new Map([[mixed[16].id, 0.5]]))
  assert.equal(background[(40 * width + 80) * 4], 50)
  assert.equal(background[(80 * width) * 4], 0, 'trigger calibration must not alter the keyboard')
})

test('keyboard, kick, and snare trigger independently and held pads wait for release', () => {
  const runtime = new DetectionRuntime(mixed)
  const calls = []
  const audio = {
    trigger: (note) => calls.push(['note', note]),
    playDrum: (sound) => calls.push(['drum', sound]),
  }
  const map = new Map(mixed.map((zone) => [zone.id, zone]))
  const occupied = { [mixed[0].id]: 0.8, [mixed[16].id]: 0.8, [mixed[17].id]: 0.8 }
  for (const event of tick(runtime, 0, occupied).events) dispatchZoneEvent(event, map, audio)
  assert.deepEqual(calls.map(([type, sound]) => [type, sound]), [
    ['note', mixed[0].action.note], ['drum', 'kick'], ['drum', 'snare'],
  ])
  assert.deepEqual(tick(runtime, 100, occupied).events, [])
  tick(runtime, 200)
  const releases = tick(runtime, 300).events
  assert.deepEqual(releases.map(({ type }) => type), ['release', 'release', 'release'])
  for (const event of releases) dispatchZoneEvent(event, map, audio)
  assert.equal(calls.length, 3, 'release is silent for one-shot note and drum actions')
  const next = tick(runtime, 400, { [mixed[16].id]: 0.8 }).events
  assert.deepEqual(next, [{ type: 'trigger', zoneId: mixed[16].id }])
  dispatchZoneEvent(next[0], map, audio)
  assert.deepEqual(calls.at(-1), ['drum', 'kick'])
})

test('broad suppression retains classic eight-key boundary in a mixed layout', () => {
  const eight = Object.fromEntries(classic.slice(0, 8).map(({ id }) => [id, 0.8]))
  assert.deepEqual(new ZoneTracker(classic).update(values(classic, eight), 0, settings), [])
  assert.deepEqual(new ZoneTracker(mixed).update(values(mixed, eight), 0, settings), [])
  const seven = Object.fromEntries(classic.slice(0, 7).map(({ id }) => [id, 0.8]))
  assert.equal(new ZoneTracker(classic).update(values(classic, seven), 0, settings).length, 7)
  assert.equal(new ZoneTracker(mixed).update(values(mixed, seven), 0, settings).length, 7)
  const pads = { [mixed[16].id]: 0.8, [mixed[17].id]: 0.8 }
  assert.deepEqual(new ZoneTracker(mixed).update(values(mixed, pads), 0, settings), [
    { type: 'trigger', zoneId: mixed[16].id },
    { type: 'trigger', zoneId: mixed[17].id },
  ])
  assert.deepEqual(new ZoneTracker(mixed).update(values(mixed,
    Object.fromEntries(mixed.map(({ id }) => [id, 0.8]))), 0, settings), [])
})

test('trigger zones share local adaptation and freeze under high occupancy', () => {
  const runtime = new DetectionRuntime(mixed)
  const drift = { [mixed[16].id]: 0.08 }
  let adapted = false
  for (let now = 0; now <= 8_000; now += 100) {
    const result = tick(runtime, now, drift)
    adapted ||= result.alpha.has(mixed[16].id)
    assert.equal(result.global.driftCount, 1)
  }
  assert.ok(adapted)
  for (let now = 8_100; now <= 12_000; now += 100) {
    const result = tick(runtime, now, { [mixed[16].id]: 0.8 })
    assert.equal(result.alpha.has(mixed[16].id), false)
    assert.equal(result.global.state, 'blocked')
  }
  runtime.reset() // Also used by manual reference and camera restart.
  assert.equal(runtime.local.snapshot(mixed[16].id, 12_000).state, 'normal')
  assert.equal(runtime.tracker.snapshot(mixed[16].id, 12_000).history.length, 0)
  assert.equal(runtime.global.snapshot(12_000).state, 'normal')
  assert.equal(tick(runtime, 12_100).global.activeCount, 0)
})

test('a cleared large trigger zone does not permanently block global idle state', () => {
  const runtime = new DetectionRuntime(mixed)
  assert.equal(tick(runtime, 0, { [mixed[16].id]: 0.8 }).global.state, 'blocked')
  let state
  for (let now = 100; now <= 9_000; now += 100) state = tick(runtime, now).global
  assert.equal(state.activeCount, 0)
  assert.equal(state.highCount, 0)
  assert.equal(state.state, 'normal')
})

test('global idle calibration counts safe trigger drift in a mixed layout', () => {
  const runtime = new DetectionRuntime(mixed)
  const drift = Object.fromEntries([...mixed.slice(0, 8), mixed[16]].map(({ id }) => [id, 0.08]))
  let refreshedTrigger = false
  let completed = false
  for (let now = 0; now <= 15_000; now += 100) {
    const result = tick(runtime, now, drift)
    assert.equal(result.global.requiredDriftCount, 9)
    if (result.global.state === 'refreshing' && result.alpha.has(mixed[16].id)) refreshedTrigger = true
    if (result.global.state === 'cooldown') { completed = true; break }
  }
  assert.ok(refreshedTrigger && completed)
  runtime.reset()
  assert.equal(runtime.global.snapshot(15_000).state, 'normal')
  assert.equal(runtime.tracker.snapshot(mixed[16].id, 15_000).history.length, 0)
})
