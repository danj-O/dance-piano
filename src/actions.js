// Release establishes an interaction event but does not stop the current synth's
// short, self-releasing notes.
export function dispatchZoneEvent(event, zonesById, audio) {
  if (event.type === 'release') return false
  if (event.type !== 'trigger') throw new RangeError(`Unknown zone event: ${event.type}`)
  const action = zonesById.get(event.zoneId)?.action
  if (!action) throw new RangeError(`No action for zone: ${event.zoneId}`)
  if (action.type !== 'note') throw new RangeError(`Unknown action type: ${action.type}`)
  audio.play(action.note)
  return true
}
