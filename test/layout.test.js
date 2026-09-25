import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultLayout, createMixedDemoLayout, generateZones, LAYOUT_VERSION } from '../src/layout.js'
import { dispatchZoneEvent } from '../src/actions.js'
import { displayRect } from '../src/display-geometry.js'
import { DEFAULT_SETTINGS, zonePixelBounds } from '../src/detector.js'
import { DEFAULT_MUSIC, buildNotes } from '../src/music.js'

test('the versioned default keyboard generates sixteen stable camera-order zones', () => {
  const layout = createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  const zones = generateZones(layout)
  assert.equal(layout.version, LAYOUT_VERSION)
  assert.equal(layout.modules.length, 1)
  assert.equal(layout.modules[0].type, 'keyboard')
  assert.equal(zones.length, 16)
  assert.deepEqual(generateZones(layout), zones)
  assert.deepEqual(zones.map(({ id }) => id), Array.from({ length: 16 }, (_, index) => `keyboard-1:key-${index}`))
  assert.ok(zones.every(({ moduleId }) => moduleId === 'keyboard-1'))
  assert.equal(layout.modules[0].transform.y, (1 - DEFAULT_SETTINGS.zoneHeight) * DEFAULT_SETTINGS.zonePosition)
  assert.deepEqual(zones[0].geometry, { x: 0, y: layout.modules[0].transform.y, width: 1 / 16, height: DEFAULT_SETTINGS.zoneHeight })
  for (const [index, zone] of zones.entries()) {
    const bounds = zonePixelBounds(zone.geometry, 320, 240)
    assert.equal(bounds.x1, index * 20)
    assert.equal(bounds.x2, (index + 1) * 20)
    assert.equal(bounds.y1, 224)
    assert.equal(bounds.y2, 225)
  }
})

test('mirrored screen order and note actions preserve low-to-high visible pitch', () => {
  const zones = generateZones(createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC))
  const screenOrder = [...zones].reverse()
  assert.deepEqual(screenOrder.map(({ action }) => action.note), buildNotes(DEFAULT_MUSIC, 16))
  const played = []
  const audio = { trigger: (note) => played.push(note) }
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone]))
  assert.equal(dispatchZoneEvent({ type: 'trigger', zoneId: zones[15].id }, zoneMap, audio), true)
  assert.equal(dispatchZoneEvent({ type: 'release', zoneId: zones[15].id }, zoneMap, audio), false)
  assert.deepEqual(played, [buildNotes(DEFAULT_MUSIC, 16)[0]])
})

test('key count can vary internally without changing the default piano', () => {
  const layout = createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  layout.modules[0].config.keys = 8
  const zones = generateZones(layout)
  assert.equal(zones.length, 8)
  assert.equal(zones[0].geometry.width, 1 / 8)
})

test('keyboard modules can supply independent note behavior and envelope actions', () => {
  const layout = createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  layout.modules[0].config.keys = 1
  layout.modules.push({
    id: 'keyboard-2', type: 'keyboard',
    transform: { x: 0, y: 0.5, width: 0.25, height: 0.1 },
    config: { ...layout.modules[0].config, note: {
      mode: 'gate', sound: 'organ', envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 },
    } },
  })
  const [oneShot, gated] = generateZones(layout)
  assert.equal(oneShot.action.mode, 'oneShot')
  assert.equal(gated.action.mode, 'gate')
  assert.equal(gated.action.sound, 'organ')
  assert.equal(gated.action.note, oneShot.action.note)
  assert.equal(gated.action.envelope.sustain, 0.7)
})

test('a trigger module generates one deterministic zone without becoming that zone', () => {
  const layout = createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  const trigger = {
    id: 'side-pad', type: 'trigger',
    transform: { x: 0.12, y: 0.3, width: 0.2, height: 0.15 },
    label: 'SIDE', action: { type: 'note', note: 'G4', mode: 'gate', sound: 'bell',
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.4 } },
  }
  layout.modules.push(trigger)
  const zone = generateZones(layout).at(-1)
  assert.deepEqual(zone, {
    id: 'side-pad:zone-0', moduleId: 'side-pad', geometry: trigger.transform,
    label: 'SIDE', action: trigger.action,
  })
  assert.notStrictEqual(zone.geometry, trigger.transform)
  assert.notStrictEqual(zone.action, trigger.action)
  assert.notStrictEqual(zone.action.envelope, trigger.action.envelope)
  assert.deepEqual(generateZones(layout).at(-1), zone)
  const calls = []
  const audio = {
    noteOn: (note, options) => calls.push(['on', note, options.voiceId]),
    noteOff: (voiceId) => calls.push(['off', voiceId]),
  }
  const zoneMap = new Map([[zone.id, zone]])
  dispatchZoneEvent({ type: 'trigger', zoneId: zone.id }, zoneMap, audio)
  dispatchZoneEvent({ type: 'release', zoneId: zone.id }, zoneMap, audio)
  assert.deepEqual(calls, [['on', 'G4', zone.id], ['off', zone.id]])
})

test('mixed demo has the classic keyboard and independent mirrored left/right triggers', () => {
  const layout = createMixedDemoLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  const zones = generateZones(layout)
  assert.equal(layout.version, LAYOUT_VERSION)
  assert.deepEqual(layout.modules.map(({ id }) => id), ['keyboard-1', 'trigger-left', 'trigger-right'])
  assert.equal(zones.length, 18)
  assert.deepEqual(zones.slice(0, 16), generateZones(createDefaultLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)))
  assert.deepEqual(zones.slice(16).map(({ id }) => id), ['trigger-left:zone-0', 'trigger-right:zone-0'])
  assert.deepEqual(zones.slice(16).map(({ action }) => action), [
    { type: 'drum', sound: 'kick' }, { type: 'drum', sound: 'snare' },
  ])
  const frame = { x: 0, y: 0, w: 1000, h: 750 }
  const left = displayRect(zones[16].geometry, frame)
  const right = displayRect(zones[17].geometry, frame)
  assert.ok(left.x < right.x, 'camera-right is performer-left after mirroring')
  assert.ok(Math.abs(left.x - 80) < 1e-9)
  assert.ok(Math.abs(right.x - 780) < 1e-9)
  assert.equal(left.y, right.y)
  assert.deepEqual(displayRect(zones[15].geometry, frame).x,
    displayRect(zones[0].geometry, frame).x - 15 * 1000 / 16)
})

test('invalid or overlapping trigger geometry and duplicate module IDs fail safely', () => {
  const layout = createMixedDemoLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
  const trigger = layout.modules[1]
  for (const transform of [
    { ...trigger.transform, x: -0.1 },
    { ...trigger.transform, x: 0.9 },
    { ...trigger.transform, width: 0 },
    { ...trigger.transform, height: NaN },
    { ...trigger.transform, y: 0.9 },
  ]) {
    trigger.transform = transform
    assert.throws(() => generateZones(layout), /geometry/)
  }
  trigger.transform = { x: 0.08, y: 0.38, width: 0.14, height: 0.2 }
  assert.throws(() => generateZones(layout), /Overlapping/)
  trigger.transform = { x: 0.78, y: 0.38, width: 0.14, height: 0.2 }
  trigger.id = 'trigger-right'
  assert.throws(() => generateZones(layout), /unique/)
  trigger.id = 'trigger-left'
  trigger.action = { type: 'drum', sound: 'missing' }
  assert.throws(() => generateZones(layout), /supported/)
  for (const action of [
    { type: 'note', note: 'H4' },
    { type: 'note', note: 'C4', sound: 'missing' },
    { type: 'note', note: 'C4', envelope: { attack: -1 } },
  ]) {
    trigger.action = action
    assert.throws(() => generateZones(layout), /supported/)
  }
})
