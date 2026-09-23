import { delaySeconds, effectSendGain, normalizeMusicSettings } from './music.js'

const NOTE_NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const PRESETS = {
  softKeys: { partials: [['sine', 1, 0.8], ['sine', 2, 0.2]], attack: 0.008, decay: 0.16, sustain: 0.25, hold: 0.12, release: 0.42 },
  bell: { partials: [['sine', 1, 0.6], ['sine', 2.01, 0.28], ['sine', 3.93, 0.12]], attack: 0.004, decay: 0.5, sustain: 0.08, hold: 0.03, release: 0.9 },
  pluck: { partials: [['triangle', 1, 0.9], ['sine', 2, 0.1]], attack: 0.004, decay: 0.12, sustain: 0.12, hold: 0.04, release: 0.28 },
  brightSynth: { partials: [['sawtooth', 1, 1]], attack: 0.012, decay: 0.18, sustain: 0.42, hold: 0.15, release: 0.34 },
  organ: { partials: [['sine', 1, 0.6], ['sine', 2, 0.3], ['sine', 3, 0.1]], attack: 0.02, decay: 0.06, sustain: 0.8, hold: 0.22, release: 0.3 },
}

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
  async start(settings) {
    this.context = new AudioContext()
    const ctx = this.context
    this.input = ctx.createGain()
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 4
    compressor.connect(ctx.destination)

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

  setSettings(settings) {
    this.settings = normalizeMusicSettings(settings)
    if (!this.context || this.context.state === 'closed') return
    const now = this.context.currentTime
    this.reverbSend.gain.setTargetAtTime(this.settings.reverbOn ? effectSendGain(this.settings.reverbMix) : 0, now, 0.02)
    this.delaySend.gain.setTargetAtTime(this.settings.delayOn ? effectSendGain(this.settings.delayMix) : 0, now, 0.02)
    this.delay.delayTime.setTargetAtTime(delaySeconds(this.settings), now, 0.02)
  }

  play(note) {
    if (!this.context || this.context.state !== 'running') return
    const ctx = this.context
    const preset = PRESETS[this.settings.sound]
    const now = ctx.currentTime
    const peak = 0.18
    const amp = ctx.createGain()
    const sustain = Math.max(0.001, peak * preset.sustain)
    const decayEnd = now + preset.attack + preset.decay
    const releaseStart = decayEnd + preset.hold
    const end = releaseStart + preset.release
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.linearRampToValueAtTime(peak, now + preset.attack)
    amp.gain.exponentialRampToValueAtTime(sustain, decayEnd)
    amp.gain.setValueAtTime(sustain, releaseStart)
    amp.gain.exponentialRampToValueAtTime(0.0001, end)
    amp.connect(this.input)

    let remaining = preset.partials.length
    for (const [type, ratio, level] of preset.partials) {
      const oscillator = ctx.createOscillator()
      const partialGain = ctx.createGain()
      oscillator.type = type
      oscillator.frequency.value = frequency(note) * ratio
      partialGain.gain.value = level
      oscillator.connect(partialGain).connect(amp)
      oscillator.onended = () => {
        oscillator.disconnect()
        partialGain.disconnect()
        if (--remaining === 0) amp.disconnect()
      }
      oscillator.start(now)
      oscillator.stop(end + 0.03)
    }
  }

  async stop() {
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.context = null
  }
}
