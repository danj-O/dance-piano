import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorSession, cameraPoint, dragTransform, handleAt, moduleAt, resizeTransform, validTransform } from '../src/editor.js'
import { displayRect } from '../src/display-geometry.js'
import { createMixedDemoLayout, generateZones } from '../src/layout.js'
import { DEFAULT_SETTINGS } from '../src/detector.js'
import { DEFAULT_MUSIC } from '../src/music.js'
import { DetectionRuntime } from '../src/detection-runtime.js'

const layout = () => createMixedDemoLayout(DEFAULT_SETTINGS, DEFAULT_MUSIC)
const view = { x: 100, y: 50, w: 800, h: 600 }
const center = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
const byId = (session, id) => session.layout.modules.find((module) => module.id === id)

test('selection targets whole modules, including a very thin keyboard, and empty space deselects', () => {
  const session = new EditorSession(layout())
  const keyboard = displayRect(byId(session, 'keyboard-1').transform, view)
  assert.equal(moduleAt(session.layout, { x: keyboard.x + 300, y: keyboard.y + 14 }, view), 'keyboard-1')
  assert.equal(session.begin({ x: keyboard.x + 300, y: keyboard.y + 14 }, view), true)
  assert.equal(session.selectedId, 'keyboard-1')
  session.end()
  assert.equal(session.begin(center(displayRect(byId(session, 'trigger-left').transform, view)), view), true)
  assert.equal(session.selectedId, 'trigger-left')
  session.end()
  assert.equal(session.begin({ x: 500, y: 180 }, view), false)
  assert.equal(session.selectedId, null)
})

test('drag follows the pointer in mirrored screen space and clamps to camera bounds', () => {
  const original = { x: 0.78, y: 0.38, width: 0.14, height: 0.2 }
  const start = { x: 200, y: 300 }
  const moved = dragTransform(original, start, { x: 280, y: 360 }, view)
  assert.ok(Math.abs(moved.x - 0.68) < 1e-10)
  assert.ok(Math.abs(moved.y - 0.48) < 1e-10)
  assert.ok(Math.abs(displayRect(moved, view).x - displayRect(original, view).x - 80) < 1e-10)
  assert.deepEqual(dragTransform(original, start, { x: -2000, y: 2000 }, view),
    { ...original, x: 0.86, y: 0.8 })
})

test('mirrored coordinate conversion uses the actual aspect-fit view at any viewport scale', () => {
  assert.deepEqual(cameraPoint({ x: 180, y: 200 }, view), { x: 0.9, y: 0.25 })
  const scaled = { x: 20, y: 30, w: 400, h: 300 }
  assert.deepEqual(cameraPoint({ x: 60, y: 105 }, scaled), { x: 0.9, y: 0.25 })
  const start = { x: 120, y: 100 }
  const original = layout().modules[1].transform
  const a = dragTransform(original, start, { x: 200, y: 160 }, view)
  const b = dragTransform(original, { x: 30, y: 55 }, { x: 70, y: 85 }, scaled)
  assert.deepEqual(a, b)
})

test('corner resizing changes both dimensions, enforces minima, and clamps to the view', () => {
  const original = layout().modules[1].transform
  const box = displayRect(original, view)
  const se = { x: box.x + box.w, y: box.y + box.h }
  const larger = resizeTransform(original, 'se', se, { x: se.x + 40, y: se.y + 60 }, view, 'trigger')
  assert.ok(Math.abs(larger.width - 0.19) < 1e-10)
  assert.ok(Math.abs(larger.height - 0.3) < 1e-10)
  assert.equal(larger.x, original.x - 0.05)
  const smallest = resizeTransform(original, 'se', se, { x: se.x - 1000, y: se.y - 1000 }, view, 'trigger')
  assert.ok(Math.abs(smallest.width - 0.06) < 1e-10)
  assert.ok(Math.abs(smallest.height - 0.06) < 1e-10)
  const bounded = resizeTransform(original, 'se', se, { x: 2000, y: 2000 }, view, 'trigger')
  assert.ok(bounded.x >= 0 && bounded.y >= 0 && bounded.x + bounded.width <= 1)
  assert.ok(bounded.y + bounded.height <= 1)
  const nw = { x: box.x, y: box.y }
  assert.equal(handleAt(original, nw, view), 'nw')
  assert.equal(handleAt(original, se, view), 'se')
  const grownUp = resizeTransform(original, 'nw', nw, { x: nw.x - 30, y: nw.y - 30 }, view, 'trigger')
  assert.ok(grownUp.width > original.width && grownUp.height > original.height)
})

test('keyboard resize regenerates 16 equal zones without changing IDs, notes, or order', () => {
  const session = new EditorSession(layout())
  const before = generateZones(session.layout)
  const keyboard = byId(session, 'keyboard-1')
  const box = displayRect(keyboard.transform, view)
  const point = { x: box.x, y: box.y }
  session.selectedId = keyboard.id
  assert.equal(session.begin(point, view), true)
  session.move({ x: point.x + 80, y: point.y - 60 })
  session.end()
  const after = generateZones(session.layout)
  assert.equal(after.length, 18)
  assert.deepEqual(after.map((zone) => zone.id), before.map((zone) => zone.id))
  assert.deepEqual(after.map((zone) => zone.action), before.map((zone) => zone.action))
  assert.ok(after[0].geometry.width < before[0].geometry.width)
  assert.ok(after[0].geometry.height > before[0].geometry.height)
})

test('valid trigger movement retains action; overlap while moving or resizing keeps last valid geometry', () => {
  const session = new EditorSession(layout())
  const trigger = byId(session, 'trigger-left')
  const initial = { ...trigger.transform }
  const action = { ...trigger.action }
  const start = center(displayRect(initial, view))
  session.begin(start, view)
  session.move({ x: start.x + 40, y: start.y })
  const valid = { ...trigger.transform }
  assert.notDeepEqual(valid, initial)
  assert.equal(validTransform(session.layout, trigger.id, valid), true)
  session.move({ x: start.x + 560, y: start.y })
  assert.ok(session.invalidTransform)
  assert.deepEqual(trigger.transform, valid)
  session.end()
  assert.equal(session.invalidTransform, null)
  assert.deepEqual(generateZones(session.layout).at(-2).action, action)
  const box = displayRect(trigger.transform, view)
  const corner = { x: box.x + box.w, y: box.y + box.h }
  session.selectedId = trigger.id
  session.begin(corner, view)
  session.move({ x: corner.x + 200, y: corner.y + 500 })
  assert.ok(session.invalidTransform)
  assert.deepEqual(trigger.transform, valid)
  session.end()
})

test('Cancel restores the entry snapshot; Done retains valid session geometry and fresh zone runtime', () => {
  const session = new EditorSession(layout())
  const before = session.cancel()
  const trigger = byId(session, 'trigger-right')
  const start = center(displayRect(trigger.transform, view))
  session.begin(start, view)
  session.move({ x: start.x - 40, y: start.y - 40 })
  session.end()
  assert.deepEqual(session.cancel(), before)
  const accepted = session.done()
  assert.notDeepEqual(accepted, before)
  const zones = generateZones(accepted)
  assert.deepEqual(zones.map((zone) => zone.id), generateZones(before).map((zone) => zone.id))
  const runtime = new DetectionRuntime(zones)
  const changed = zones.find((zone) => zone.id === 'trigger-right:zone-0')
  assert.deepEqual(changed.geometry, accepted.modules[2].transform)
  assert.equal(runtime.tracker.snapshot(changed.id, 0).history.length, 0)
  assert.equal(runtime.local.snapshot(changed.id, 0).state, 'normal')
})
