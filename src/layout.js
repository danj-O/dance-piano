import { buildNotes } from './music.js?v=mobile-compat'

export const LAYOUT_VERSION = 1
export const CLASSIC_KEY_COUNT = 16

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
      },
    }],
  }
}

export function generateZones(layout) {
  if (layout.version !== LAYOUT_VERSION) throw new RangeError('Unknown layout version')
  const zones = []
  for (const module of layout.modules) {
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
        action: { type: 'note', note: notes[index] },
      })
    }
  }
  return zones
}
