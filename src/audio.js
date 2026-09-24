import {
  delaySeconds, effectSendGain, normalizeEnvelope, normalizeMusicSettings, SOUND_ENVELOPES,
} from './music.js?v=phase-3'

const NOTE_NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const PRESETS = {
  softKeys: { partials: [['sine', 1, 0.8], ['sine', 2, 0.2]], hold: 0.12 },
  bell: { partials: [['sine', 1, 0.6], ['sine', 2.01, 0.28], ['sine', 3.93, 0.12]], hold: 0.03 },
  pluck: { partials: [['triangle', 1, 0.9], ['sine', 2, 0.1]], hold: 0.04 },
  brightSynth: { partials: [['sawtooth', 1, 1]], hold: 0.15 },
  organ: { partials: [['sine', 1, 0.6], ['sine', 2, 0.3], ['sine', 3, 0.1]], hold: 0.22 },
}
const VOICE_FLOOR = 0.0001
const VOICE_PEAK = 0.18
const OSCILLATOR_TAIL = 0.03
const ALL_NOTES_OFF_RELEASE = 0.02

function frequency(note) {
  const [, name, sharp, octave] = /^([A-G])(#?)(\d)$/.exec(note) ?? []
  if (name === undefined) throw new Error(`Invalid note: ${note}`)
  const midi = (Number(octave) + 1) * 12 + NOTE_NAMES[name] + (sharp ? 1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}

function reverbImpulse(context) {
  const length = Math.round(context.sampleRate * 1.8)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2 * 0.35
    }
  }
  return buffer
}

export class DanceAudio {
  constructor() {
    this.muted = false
  }

  async start(settings) {
    this.context = new AudioContext()
    this.voices = new Set()
    this.gatedVoices = new Map()
    const ctx = this.context
    this.input = ctx.createGain()
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 4
    this.output = ctx.createGain()
    this.output.gain.value = this.muted ? 0 : 1
    compressor.connect(this.output).connect(ctx.destination)

    const dry = ctx.createGain()
    dry.gain.value = 0.85
    this.input.connect(dry).connect(compressor)

    this.reverbSend = ctx.createGain()
    const convolver = ctx.createConvolver()
    convolver.buffer = reverbImpulse(ctx)
    this.input.connect(this.reverbSend).connect(convolver).connect(compressor)

    this.delaySend = ctx.createGain()
    this.delay = ctx.createDelay(2)
    const feedback = ctx.createGain()
    feedback.gain.value = 0.3
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 2800
    this.input.connect(this.delaySend).connect(this.delay)
    this.delay.connect(feedback).connect(this.delay)
    this.delay.connect(lowpass).connect(compressor)

    this.setSettings(settings)
    await ctx.resume()
  }

  setMuted(muted) {
    this.muted = Boolean(muted)
    if (!this.context || this.context.state === 'closed') return
    const now = this.context.currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.008)
    if (this.muted) this.output.gain.setValueAtTime(0, now + 0.08)
  }

  setSettings(settings) {
    this.settings = normalizeMusicSettings(settings)
    if (!this.context || this.context.state === 'closed') return
    const now = this.context.currentTime
    this.reverbSend.gain.setTargetAtTime(this.settings.reverbOn ? effectSendGain(this.settings.reverbMix) : 0, now, 0.02)
    this.delaySend.gain.setTargetAtTime(this.settings.delayOn ? effectSendGain(this.settings.delayMix) : 0, now, 0.02)
    this.delay.delayTime.setTargetAtTime(delaySeconds(this.settings), now, 0.02)
  }

  trigger(note, options = {}) {
    return this._createVoice(note, options, false)
  }

  // Compatibility for the sound preview and older callers.
  play(note, options = {}) {
    return this.trigger(note, options)
  }

  noteOn(note, options = {}) {
    if (options.voiceId == null) throw new RangeError('Gated notes need a voiceId')
    const previous = this.gatedVoices?.get(options.voiceId)
    if (previous) this._releaseVoice(previous, this.context.currentTime, previous.envelope.release)
    return this._createVoice(note, options, true)
  }

  noteOff(voiceId) {
    const voice = this.gatedVoices?.get(voiceId)
    if (!voice) return false
    this._releaseVoice(voice, this.context.currentTime, voice.envelope.release)
    return true
  }

  _levelAt(voice, time) {
    if (voice.releaseAt != null && time >= voice.releaseAt) {
      const progress = Math.min(1, (time - voice.releaseAt) / voice.releaseDuration)
      return voice.releaseLevel * (VOICE_FLOOR / voice.releaseLevel) ** progress
    }
    const elapsed = Math.max(0, time - voice.startedAt)
    const { attack, decay } = voice.envelope
    if (attack > 0 && elapsed < attack) {
      return VOICE_FLOOR + (VOICE_PEAK - VOICE_FLOOR) * elapsed / attack
    }
    const sincePeak = elapsed - attack
    if (decay > 0 && sincePeak < decay) {
      return VOICE_PEAK * (voice.sustainLevel / VOICE_PEAK) ** (sincePeak / decay)
    }
    return voice.sustainLevel
  }

  _releaseVoice(voice, now, duration) {
    if (voice.cleaned) return
    const level = Math.max(VOICE_FLOOR, this._levelAt(voice, now))
    const end = now + duration
    voice.amp.gain.cancelScheduledValues(now)
    voice.amp.gain.setValueAtTime(level, now)
    voice.amp.gain.exponentialRampToValueAtTime(VOICE_FLOOR, end)
    voice.releaseAt = now
    voice.releaseLevel = level
    voice.releaseDuration = duration
    voice.state = 'releasing'
    if (voice.voiceId != null && this.gatedVoices.get(voice.voiceId) === voice) {
      this.gatedVoices.delete(voice.voiceId)
    }
    for (const oscillator of voice.oscillators) {
      try { oscillator.stop(end + OSCILLATOR_TAIL) }
      catch { /* an already-ended partial still cleans up through onended */ }
    }
  }

  _cleanupVoice(voice) {
    if (voice.cleaned) return
    voice.cleaned = true
    for (const oscillator of voice.oscillators) oscillator.disconnect()
    for (const gain of voice.partialGains) gain.disconnect()
    voice.amp.disconnect()
    this.voices.delete(voice)
    if (voice.voiceId != null && this.gatedVoices.get(voice.voiceId) === voice) {
      this.gatedVoices.delete(voice.voiceId)
    }
  }

  _createVoice(note, options, gate) {
    if (!this.context || this.context.state !== 'running') return null
    const hz = frequency(note)
    const ctx = this.context
    const sound = Object.prototype.hasOwnProperty.call(PRESETS, options.sound)
      ? options.sound : this.settings.sound
    const preset = PRESETS[sound]
    const sourceEnvelope = options.envelope === undefined ? this.settings.envelope : options.envelope
    const envelope = sourceEnvelope == null ? { ...SOUND_ENVELOPES[sound] }
      : normalizeEnvelope(sourceEnvelope, sound)
    const now = ctx.currentTime
    const amp = ctx.createGain()
    const sustainLevel = Math.max(VOICE_FLOOR, VOICE_PEAK * envelope.sustain)
    const attackEnd = now + envelope.attack
    const decayEnd = attackEnd + envelope.decay
    amp.gain.setValueAtTime(VOICE_FLOOR, now)
    if (envelope.attack > 0) amp.gain.linearRampToValueAtTime(VOICE_PEAK, attackEnd)
    else amp.gain.setValueAtTime(VOICE_PEAK, now)
    if (envelope.decay > 0) amp.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd)
    else amp.gain.setValueAtTime(sustainLevel, decayEnd)
    amp.connect(this.input)
    const voice = {
      note, voiceId: gate ? options.voiceId : null, state: gate ? 'active' : 'oneShot',
      startedAt: now, envelope, sustainLevel, amp, oscillators: [], partialGains: [],
      remaining: preset.partials.length, releaseAt: null, releaseLevel: null,
      releaseDuration: null, cleaned: false,
    }
    this.voices.add(voice)
    if (gate) this.gatedVoices.set(options.voiceId, voice)
    else {
      const releaseStart = decayEnd + preset.hold
      amp.gain.setValueAtTime(sustainLevel, releaseStart)
      amp.gain.exponentialRampToValueAtTime(VOICE_FLOOR, releaseStart + envelope.release)
      voice.releaseAt = releaseStart
      voice.releaseLevel = sustainLevel
      voice.releaseDuration = envelope.release
    }
    for (const [type, ratio, level] of preset.partials) {
      const oscillator = ctx.createOscillator()
      const partialGain = ctx.createGain()
      voice.oscillators.push(oscillator)
      voice.partialGains.push(partialGain)
      oscillator.type = type
      oscillator.frequency.value = hz * ratio
      partialGain.gain.value = level
      oscillator.connect(partialGain).connect(amp)
      oscillator.onended = () => {
        if (--voice.remaining === 0) this._cleanupVoice(voice)
      }
      oscillator.start(now)
      if (!gate) oscillator.stop(voice.releaseAt + envelope.release + OSCILLATOR_TAIL)
    }
    return voice
  }

  allNotesOff({ immediate = false } = {}) {
    if (!this.voices?.size || !this.context) return
    const now = this.context.currentTime
    for (const voice of [...this.voices]) {
      if (immediate) {
        for (const oscillator of voice.oscillators) {
          try { oscillator.stop(now) } catch { /* already stopped during teardown */ }
        }
        this._cleanupVoice(voice)
      } else {
        this._releaseVoice(voice, now, ALL_NOTES_OFF_RELEASE)
      }
    }
  }

  async stop() {
    this.allNotesOff({ immediate: true })
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.context = null
  }
}
