const NOTE_NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function frequency(note) {
  const [, name, sharp, octave] = /^([A-G])(#?)(\d)$/.exec(note) ?? []
  if (name === undefined) throw new Error(`Invalid note: ${note}`)
  const midi = (Number(octave) + 1) * 12 + NOTE_NAMES[name] + (sharp ? 1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}

export class PianoAudio {
  async start() {
    this.context = new AudioContext()
    await this.context.resume()
  }

  play(note) {
    if (!this.context || this.context.state !== 'running') return
    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency(note)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.22, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.18)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(now)
    oscillator.stop(now + 0.52)
  }

  async stop() {
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.context = null
  }
}
