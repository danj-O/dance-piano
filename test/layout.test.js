import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultLayout, generateZones, LAYOUT_VERSION } from '../src/layout.js'
import { dispatchZoneEvent } from '../src/actions.js'
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
  const audio = { play: (note) => played.push(note) }
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
