import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchZoneEvent } from '../src/actions.js'

function harness(mode = 'oneShot') {
  const calls = []
  const zones = new Map([
    ['a', { action: { type: 'note', note: 'C4', mode, sound: 'bell', envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.4 } } }],
    ['b', { action: { type: 'note', note: 'C4', mode, sound: 'bell' } }],
  ])
  const audio = {
    trigger: (note, options) => calls.push(['trigger', note, options]),
    noteOn: (note, options) => calls.push(['noteOn', note, options]),
    noteOff: (voiceId) => calls.push(['noteOff', voiceId]),
  }
  return { calls, zones, audio, send: (type, zoneId) => dispatchZoneEvent({ type, zoneId }, zones, audio) }
}

test('one-shot triggers once and ignores release musically', () => {
  const h = harness()
  assert.equal(h.send('trigger', 'a'), true)
  assert.equal(h.send('release', 'a'), false)
  assert.deepEqual(h.calls, [['trigger', 'C4', {
    sound: 'bell', envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.4 },
  }]])
})

test('gated action routes noteOn/noteOff by interaction identity, including duplicate notes', () => {
  const h = harness('gate')
  h.send('trigger', 'a')
  h.send('trigger', 'b')
  h.send('release', 'a')
  assert.deepEqual(h.calls.map(([method]) => method), ['noteOn', 'noteOn', 'noteOff'])
  assert.equal(h.calls[0][2].voiceId, 'a')
  assert.equal(h.calls[1][2].voiceId, 'b')
  assert.deepEqual(h.calls[2], ['noteOff', 'a'])
})

test('unknown events, actions, and modes fail at the action boundary', () => {
  const h = harness()
  assert.throws(() => h.send('exit', 'a'), /Unknown zone event/)
  assert.throws(() => h.send('trigger', 'missing'), /No action/)
  h.zones.get('a').action.mode = 'unknown'
  assert.throws(() => h.send('trigger', 'a'), /Unknown note mode/)
})
