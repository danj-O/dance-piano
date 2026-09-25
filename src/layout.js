import { buildNotes, ENVELOPE_LIMITS, NOTE_MODES, SOUND_NAMES } from './music.js?v=phase-3'

export const LAYOUT_VERSION = 1
export const CLASSIC_KEY_COUNT = 16
const DRUM_SOUNDS = new Set(['kick', 'snare'])

function validateGeometry(geometry) {
  if (!geometry || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(geometry[key]))
      || geometry.x < 0 || geometry.y < 0 || geometry.width <= 0 || geometry.height <= 0
      || geometry.x + geometry.width > 1 || geometry.y + geometry.height > 1) {
    throw new RangeError('Module geometry must be a nonempty rectangle inside the camera frame')
  }
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

function validateAction(action) {
  if (action?.type === 'drum' && DRUM_SOUNDS.has(action.sound)) return
  const envelope = action?.envelope
  const validEnvelope = envelope == null || (typeof envelope === 'object' && !Array.isArray(envelope)
    && Object.entries(envelope).every(([name, value]) => {
      const limits = ENVELOPE_LIMITS[name]
      return limits && Number.isFinite(value) && value >= limits[0] && value <= limits[1]
    }))
  if (action?.type === 'note' && /^[A-G]#?\d$/.test(action.note)
      && (action.mode == null || NOTE_MODES.includes(action.mode))
      && (action.sound == null || SOUND_NAMES.includes(action.sound)) && validEnvelope) return
  throw new RangeError('Trigger needs a supported note or drum action')
}

// Keep the saved zonePosition meaning: 0 is the highest valid strip position,
// and 1 is the lowest, after accounting for the strip's height.
export function classicStripGeometry(settings) {
  return {
    x: 0,
    y: (1 - settings.zoneHeight) * settings.zonePosition,
    width: 1,
    height: settings.zoneHeight,
  }
}

export function createDefaultLayout(settings, musicSettings) {
  return {
    version: LAYOUT_VERSION,
    id: 'classic-dance-keys',
    name: 'Classic Dance Keys',
    modules: [{
      id: 'keyboard-1',
      type: 'keyboard',
      transform: classicStripGeometry(settings),
      config: {
        keys: CLASSIC_KEY_COUNT,
        tonic: musicSettings.tonic,
        mode: musicSettings.mode,
        octave: musicSettings.octave,
        note: {
          mode: musicSettings.noteMode ?? 'oneShot',
          sound: musicSettings.sound,
          envelope: musicSettings.envelope == null ? null : { ...musicSettings.envelope },
        },
      },
    }],
  }
}

// Camera coordinates are unmirrored; high x appears on the performer's left.
// This is an opt-in development layout, not a saved or user-editable preset.
export function createMixedDemoLayout(settings, musicSettings) {
  const layout = createDefaultLayout(settings, musicSettings)
  layout.id = 'phase-5-mixed-demo'
  layout.name = 'Keyboard + two triggers (development)'
  layout.modules.push(
    { id: 'trigger-left', type: 'trigger',
      transform: { x: 0.78, y: 0.38, width: 0.14, height: 0.20 },
      label: 'KICK', action: { type: 'drum', sound: 'kick' } },
    { id: 'trigger-right', type: 'trigger',
      transform: { x: 0.08, y: 0.38, width: 0.14, height: 0.20 },
      label: 'SNARE', action: { type: 'drum', sound: 'snare' } },
  )
  return layout
}

export function generateZones(layout) {
  if (layout.version !== LAYOUT_VERSION) throw new RangeError('Unknown layout version')
  if (!Array.isArray(layout.modules) || !layout.modules.length) throw new RangeError('Layout needs modules')
  const ids = new Set()
  for (const module of layout.modules) {
    if (typeof module.id !== 'string' || !module.id || ids.has(module.id)) {
      throw new RangeError('Module IDs must be unique nonempty strings')
    }
    ids.add(module.id)
    validateGeometry(module.transform)
  }
  for (let index = 0; index < layout.modules.length; index++) {
    for (let other = index + 1; other < layout.modules.length; other++) {
      if (overlaps(layout.modules[index].transform, layout.modules[other].transform)) {
        throw new RangeError('Overlapping modules are unsupported')
      }
    }
  }
  const zones = []
  for (const module of layout.modules) {
    if (module.type === 'trigger') {
      validateAction(module.action)
      zones.push({
        id: `${module.id}:zone-0`, moduleId: module.id,
        geometry: { ...module.transform },
        label: typeof module.label === 'string' && module.label.trim() ? module.label.trim() : module.id,
        action: {
          ...module.action,
          ...(module.action.envelope == null ? {} : { envelope: { ...module.action.envelope } }),
        },
      })
      continue
    }
    if (module.type !== 'keyboard') throw new RangeError(`Unknown module type: ${module.type}`)
    const { keys } = module.config
    if (!Number.isInteger(keys) || keys < 1) throw new RangeError('Keyboard needs a positive key count')
    // Zones use camera order. The mirrored display puts camera key 0 on the right.
    const notes = buildNotes(module.config, keys).reverse()
    for (let index = 0; index < keys; index++) {
      zones.push({
        id: `${module.id}:key-${index}`,
        moduleId: module.id,
        geometry: {
          x: module.transform.x + module.transform.width * index / keys,
          y: module.transform.y,
          width: module.transform.width / keys,
          height: module.transform.height,
        },
        action: {
          type: 'note', note: notes[index],
          mode: module.config.note?.mode ?? 'oneShot',
          sound: module.config.note?.sound ?? 'softKeys',
          envelope: module.config.note?.envelope == null ? null : { ...module.config.note.envelope },
        },
      })
    }
  }
  return zones
}
