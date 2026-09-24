import test from 'node:test'
import assert from 'node:assert/strict'
import { DanceAudio } from '../src/audio.js'
import { normalizeMusicSettings } from '../src/music.js'

class FakeParam {
  constructor() { this.value = 0; this.events = [] }
  setValueAtTime(value, time) { this.events.push(['set', value, time]) }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]) }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]) }
  cancelScheduledValues(time) { this.events.push(['cancel', time]) }
  setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]) }
}
class FakeNode {
  constructor() { this.connections = []; this.disconnected = false }
  connect(target) { this.connections.push(target); return target }
  disconnect() { this.disconnected = true }
}
class FakeGain extends FakeNode { constructor() { super(); this.gain = new FakeParam() } }
class FakeOscillator extends FakeNode {
  constructor() { super(); this.frequency = { value: 0 }; this.stopTimes = [] }
  start(time) { this.startedAt = time }
  stop(time) { this.stopTimes.push(time) }
  finish() { this.onended?.() }
}
class FakeContext {
  constructor() {
    this.currentTime = 10
    this.sampleRate = 10
    this.state = 'suspended'
    this.destination = new FakeNode()
    this.oscillators = []
  }
  createGain() { return new FakeGain() }
  createOscillator() {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }
  createDynamicsCompressor() {
    const node = new FakeNode()
    node.threshold = { value: 0 }
    node.ratio = { value: 0 }
    return node
  }
  createConvolver() { return new FakeNode() }
  createDelay() { const node = new FakeNode(); node.delayTime = new FakeParam(); return node }
  createBiquadFilter() { const node = new FakeNode(); node.frequency = { value: 0 }; return node }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { getChannelData: (index) => data[index] }
  }
  async resume() { this.state = 'running' }
  async close() { this.state = 'closed' }
}

async function setup(settings = {}) {
  const OriginalAudioContext = globalThis.AudioContext
  globalThis.AudioContext = FakeContext
  try {
    const audio = new DanceAudio()
    await audio.start(normalizeMusicSettings(settings))
    return { audio, context: audio.context }
  } finally {
    globalThis.AudioContext = OriginalAudioContext
  }
}

test('one-shot schedules finite ADSR and cleans up every oscillator and gain', async () => {
  const { audio } = await setup()
  const voice = audio.trigger('C4')
  const events = voice.amp.gain.events
  assert.deepEqual(events.map(([type]) => type), ['set', 'linear', 'exponential', 'set', 'exponential'])
  assert.equal(events[1][2], 10.008)
  assert.equal(events[2][2], 10.168)
  assert.equal(events[2][1], 0.18 * 0.25)
  assert.equal(voice.oscillators.length, 2)
  assert.ok(voice.oscillators.every((oscillator) => oscillator.stopTimes.length === 1))
  assert.equal(audio.voices.size, 1)
  voice.oscillators[0].finish()
  assert.equal(audio.voices.size, 1)
  voice.oscillators[1].finish()
  assert.equal(audio.voices.size, 0)
  assert.ok(voice.cleaned && voice.amp.disconnected)
  assert.ok(voice.partialGains.every((gain) => gain.disconnected))
  await audio.stop()
})

test('gated note sustains without scheduled stop and releases from its attack level', async () => {
  const { audio, context } = await setup()
  const voice = audio.noteOn('C4', { voiceId: 'zone-a', envelope: {
    attack: 0.2, decay: 0.3, sustain: 0.5, release: 0.4,
  } })
  assert.equal(voice.state, 'active')
  assert.ok(voice.oscillators.every((oscillator) => oscillator.stopTimes.length === 0))
  context.currentTime = 10.1
  assert.equal(audio.noteOff('zone-a'), true)
  assert.equal(audio.noteOff('zone-a'), false)
  const tail = voice.amp.gain.events.slice(-3)
  assert.deepEqual(tail.map(([type]) => type), ['cancel', 'set', 'exponential'])
  assert.ok(tail[1][1] > 0.08 && tail[1][1] < 0.1)
  assert.equal(tail[2][2], 10.5)
  assert.ok(voice.oscillators.every((oscillator) => oscillator.stopTimes[0] === 10.53))
  voice.oscillators.forEach((oscillator) => oscillator.finish())
  assert.equal(audio.voices.size, 0)
  await audio.stop()
})

test('simultaneous duplicate pitches remain independent by voiceId', async () => {
  const { audio } = await setup()
  const a = audio.noteOn('C4', { voiceId: 'zone-a' })
  const b = audio.noteOn('C4', { voiceId: 'zone-b' })
  const c = audio.noteOn('E4', { voiceId: 'zone-c' })
  assert.equal(audio.gatedVoices.size, 3)
  audio.noteOff('zone-a')
  assert.equal(a.state, 'releasing')
  assert.equal(b.state, 'active')
  assert.equal(c.state, 'active')
  assert.equal(audio.gatedVoices.get('zone-b'), b)
  assert.equal(audio.gatedVoices.get('zone-c'), c)
  await audio.stop()
})

test('same identity retrigger crossfades old voice, and old cleanup cannot remove the new one', async () => {
  const { audio } = await setup()
  const first = audio.noteOn('C4', { voiceId: 'zone-a' })
  const second = audio.noteOn('C4', { voiceId: 'zone-a' })
  assert.equal(first.state, 'releasing')
  assert.equal(audio.gatedVoices.get('zone-a'), second)
  first.oscillators.forEach((oscillator) => oscillator.finish())
  assert.equal(audio.gatedVoices.get('zone-a'), second)
  audio.noteOff('zone-a')
  const third = audio.noteOn('C4', { voiceId: 'zone-a' })
  second.oscillators.forEach((oscillator) => oscillator.finish())
  assert.equal(audio.gatedVoices.get('zone-a'), third)
  await audio.stop()
})

test('all-notes-off silences polyphony and stop disconnects all remaining voices', async () => {
  const { audio, context } = await setup()
  const a = audio.noteOn('C4', { voiceId: 'a' })
  const b = audio.noteOn('E4', { voiceId: 'b' })
  const oneShot = audio.trigger('G4')
  audio.allNotesOff()
  assert.equal(audio.gatedVoices.size, 0)
  assert.ok([a, b, oneShot].every((voice) => voice.state === 'releasing'))
  await audio.stop()
  assert.equal(context.state, 'closed')
  assert.equal(audio.voices.size, 0)
  assert.ok([a, b, oneShot].every((voice) => voice.cleaned))
})

test('new settings affect only new voices and existing effects send updates remain intact', async () => {
  const { audio, context } = await setup()
  const first = audio.noteOn('C4', { voiceId: 'a' })
  audio.setSettings({ sound: 'bell', envelope: { attack: 0.2, decay: 0.4, sustain: 0.6, release: 1 },
    reverbOn: true, reverbMix: 1, delayOn: true, delayMix: 0.8, bpm: 100, delayDivision: 'quarter' })
  const second = audio.noteOn('E4', { voiceId: 'b' })
  assert.equal(first.envelope.attack, 0.008)
  assert.equal(second.envelope.attack, 0.2)
  assert.equal(second.oscillators.length, 3, 'bell partials remain in the existing graph')
  assert.ok(audio.reverbSend.gain.events.at(-1)[1] > 0)
  assert.ok(audio.delaySend.gain.events.at(-1)[1] > 0)
  assert.equal(audio.delay.delayTime.events.at(-1)[1], 0.6)
  assert.equal(context.state, 'running')
  await audio.stop()
})

test('master mute controls the combined output without ending held voices', async () => {
  const { audio, context } = await setup({ reverbOn: true, delayOn: true })
  const voice = audio.noteOn('C4', { voiceId: 'zone-a' })
  assert.equal(audio.output.connections[0], context.destination)
  assert.equal(audio.output.gain.value, 1)
  audio.setMuted(true)
  assert.equal(audio.muted, true)
  assert.deepEqual(audio.output.gain.events.slice(-3), [
    ['cancel', 10], ['target', 0, 10, 0.008], ['set', 0, 10.08],
  ])
  assert.equal(audio.gatedVoices.get('zone-a'), voice)
  audio.setMuted(false)
  assert.deepEqual(audio.output.gain.events.slice(-2), [['cancel', 10], ['target', 1, 10, 0.008]])
  assert.equal(audio.gatedVoices.get('zone-a'), voice)
  await audio.stop()
})

test('invalid note cannot leave a partial voice behind', async () => {
  const { audio } = await setup()
  assert.throws(() => audio.noteOn('H4', { voiceId: 'a' }), /Invalid note/)
  assert.equal(audio.voices.size, 0)
  assert.equal(audio.gatedVoices.size, 0)
  await audio.stop()
})
