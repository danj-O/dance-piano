import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_MUSIC, addTempoTap, buildNotes, delaySeconds, effectSendGain, normalizeMusicSettings,
} from '../src/music.js'

test('default key layout preserves the original low-to-high C major notes', () => {
  assert.deepEqual(buildNotes(DEFAULT_MUSIC), [
    'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4',
    'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5',
  ])
})

test('tonic and mode changes produce the expected sequence and octave crossings', () => {
  assert.deepEqual(buildNotes({ tonic: 'D', mode: 'dorian', octave: 3 }, 8), [
    'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4',
  ])
  assert.deepEqual(buildNotes({ tonic: 'F#', mode: 'minorPentatonic', octave: 2 }, 6), [
    'F#2', 'A2', 'B2', 'C#3', 'E3', 'F#3',
  ])
})

test('tap tempo and beat divisions set predictable delay times', () => {
  let state = addTempoTap([], 0)
  assert.equal(state.bpm, null)
  state = addTempoTap(state.taps, 500)
  assert.equal(state.bpm, 120)
  state = addTempoTap(state.taps, 1000)
  assert.equal(state.bpm, 120)
  assert.equal(delaySeconds({ bpm: 120, delayDivision: 'quarter' }), 0.5)
  assert.equal(delaySeconds({ bpm: 120, delayDivision: 'eighth' }), 0.25)
  assert.equal(delaySeconds({ bpm: 120, delayDivision: 'dottedEighth' }), 0.375)
  assert.equal(addTempoTap(state.taps, 4000).bpm, null)
})

test('stored music settings reject invalid choices without capping effect amounts', () => {
  const value = normalizeMusicSettings({ tonic: 'H', mode: 'unknown', octave: 9, sound: 'unknown', reverbMix: 5, delayMix: -2, bpm: 999, delayOn: true })
  assert.equal(value.tonic, 'C')
  assert.equal(value.mode, 'major')
  assert.equal(value.octave, 4)
  assert.equal(value.sound, 'softKeys')
  assert.equal(value.reverbMix, 5)
  assert.equal(value.delayMix, 0)
  assert.equal(value.bpm, 220)
  assert.equal(value.delayOn, true)
})

test('effect send gain rises beyond 60% and tapers at high amounts', () => {
  assert.equal(effectSendGain(0), 0)
  assert.ok(effectSendGain(1) > effectSendGain(0.6))
  assert.ok(effectSendGain(2) > effectSendGain(1))
  assert.ok(effectSendGain(100) <= 2)
})

test('music setup and tap tempo work without newer Safari helpers', () => {
  const hasOwn = Object.hasOwn
  const arrayAt = Array.prototype.at
  try {
    Object.hasOwn = undefined
    Array.prototype.at = undefined
    assert.equal(normalizeMusicSettings({ mode: 'dorian', delayDivision: 'quarter' }).mode, 'dorian')
    assert.equal(addTempoTap([0], 500).bpm, 120)
  } finally {
    Object.hasOwn = hasOwn
    Array.prototype.at = arrayAt
  }
})
