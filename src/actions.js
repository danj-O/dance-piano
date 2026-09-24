// Zone events stay musical-meaning-free until the action interprets them.
export function dispatchZoneEvent(event, zonesById, audio) {
  if (event.type !== 'trigger' && event.type !== 'release') {
    throw new RangeError(`Unknown zone event: ${event.type}`)
  }
  const action = zonesById.get(event.zoneId)?.action
  if (!action) throw new RangeError(`No action for zone: ${event.zoneId}`)
  if (action.type !== 'note') throw new RangeError(`Unknown action type: ${action.type}`)
  const mode = action.mode ?? 'oneShot'
  if (mode !== 'oneShot' && mode !== 'gate') throw new RangeError(`Unknown note mode: ${mode}`)
  if (event.type === 'release') {
    if (mode === 'gate') audio.noteOff(event.zoneId)
    return false
  }
  const options = { sound: action.sound, envelope: action.envelope }
  if (mode === 'gate') audio.noteOn(action.note, { ...options, voiceId: event.zoneId })
  else audio.trigger(action.note, options)
  return true
}
