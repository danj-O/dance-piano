export const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const MODES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  chromatic: Array.from({ length: 12 }, (_, i) => i),
})

export const SOUND_NAMES = ['softKeys', 'bell', 'pluck', 'brightSynth', 'organ']
export const DELAY_DIVISIONS = { quarter: 1, eighth: 0.5, dottedEighth: 0.75 }
export const NOTE_MODES = ['oneShot', 'gate']
export const SOUND_ENVELOPES = Object.freeze({
  softKeys: Object.freeze({ attack: 0.008, decay: 0.16, sustain: 0.25, release: 0.42 }),
  bell: Object.freeze({ attack: 0.004, decay: 0.5, sustain: 0.08, release: 0.9 }),
  pluck: Object.freeze({ attack: 0.004, decay: 0.12, sustain: 0.12, release: 0.28 }),
  brightSynth: Object.freeze({ attack: 0.012, decay: 0.18, sustain: 0.42, release: 0.34 }),
  organ: Object.freeze({ attack: 0.02, decay: 0.06, sustain: 0.8, release: 0.3 }),
})
export const ENVELOPE_LIMITS = Object.freeze({
  attack: [0, 1.5], decay: [0, 3], sustain: [0, 1], release: [0.02, 5],
})

export function normalizeEnvelope(value, sound = 'softKeys') {
  const result = { ...(SOUND_ENVELOPES[sound] ?? SOUND_ENVELOPES.softKeys) }
  for (const [name, [min, max]] of Object.entries(ENVELOPE_LIMITS)) {
    const candidate = Number(value?.[name])
    if (value?.[name] != null && Number.isFinite(candidate)) {
      result[name] = Math.min(max, Math.max(min, candidate))
    }
  }
  return result
}

export function effectiveEnvelope(settings) {
  return settings.envelope == null ? { ...(SOUND_ENVELOPES[settings.sound] ?? SOUND_ENVELOPES.softKeys) }
    : normalizeEnvelope(settings.envelope, settings.sound)
}

export const DEFAULT_MUSIC = Object.freeze({
  tonic: 'C',
  mode: 'major',
  octave: 3,
  sound: 'softKeys',
  noteMode: 'oneShot',
  envelope: null, // null keeps the current sound's original amplitude character.
  reverbOn: false,
  reverbMix: 0.2,
  delayOn: false,
  delayMix: 0.22,
  bpm: 120,
  delayDivision: 'eighth',
})

export function normalizeMusicSettings(value = {}) {
  const result = { ...DEFAULT_MUSIC }
  if (TONICS.includes(value.tonic)) result.tonic = value.tonic
  if (Object.prototype.hasOwnProperty.call(MODES, value.mode)) result.mode = value.mode
  if (SOUND_NAMES.includes(value.sound)) result.sound = value.sound
  if (NOTE_MODES.includes(value.noteMode)) result.noteMode = value.noteMode
  if (value.envelope && typeof value.envelope === 'object' && !Array.isArray(value.envelope)) {
    result.envelope = normalizeEnvelope(value.envelope, result.sound)
  }
  if (Object.prototype.hasOwnProperty.call(DELAY_DIVISIONS, value.delayDivision)) result.delayDivision = value.delayDivision
  for (const name of ['reverbOn', 'delayOn']) {
    if (typeof value[name] === 'boolean') result[name] = value[name]
  }
  for (const [name, min, max] of [
    ['octave', 2, 4], ['bpm', 40, 220],
  ]) {
    const number = Number(value[name])
    if (value[name] != null && Number.isFinite(number)) result[name] = Math.min(max, Math.max(min, number))
  }
  for (const name of ['reverbMix', 'delayMix']) {
    const number = Number(value[name])
    if (value[name] != null && Number.isFinite(number)) result[name] = Math.max(0, number)
  }
  result.octave = Math.round(result.octave)
  result.bpm = Math.round(result.bpm)
  return result
}

// Allow any nonnegative setting while tapering the actual wet send at high values.
export function effectSendGain(amount) {
  return 2 * Math.tanh(amount / 2)
}

export function buildNotes(settings, count = 16) {
  const tonic = TONICS.indexOf(settings.tonic)
  const intervals = MODES[settings.mode]
  if (tonic < 0 || !intervals) throw new RangeError('Unknown tonic or mode')
  const rootMidi = (settings.octave + 1) * 12 + tonic
  return Array.from({ length: count }, (_, index) => {
    const midi = rootMidi + 12 * Math.floor(index / intervals.length) + intervals[index % intervals.length]
    return `${TONICS[midi % 12]}${Math.floor(midi / 12) - 1}`
  })
}

export function delaySeconds(settings) {
  return (60 / settings.bpm) * DELAY_DIVISIONS[settings.delayDivision]
}

// Use recent taps so the value responds to a new tempo instead of averaging an old one.
export function addTempoTap(previousTaps, atMs) {
  const previous = previousTaps[previousTaps.length - 1]
  const taps = previous == null || atMs - previous < 250 || atMs - previous > 1500
    ? [atMs]
    : [...previousTaps.slice(-3), atMs]
  if (taps.length < 2) return { taps, bpm: null }
  const intervals = taps.slice(1).map((time, i) => time - taps[i]).sort((a, b) => a - b)
  const middle = Math.floor(intervals.length / 2)
  const median = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2
  return { taps, bpm: Math.max(40, Math.min(220, Math.round(60000 / median))) }
}
