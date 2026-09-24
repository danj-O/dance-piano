import {
  FRAME_HEIGHT, FRAME_WIDTH, DEFAULT_SETTINGS,
  adaptBackground, measureZones, normalizeSettings,
} from './detector.js?v=manual-reference-only'
import { DanceAudio } from './audio.js?v=phase-3'
import { DEFAULT_MUSIC, addTempoTap, effectiveEnvelope, normalizeMusicSettings } from './music.js?v=phase-3'
import { createDefaultLayout, generateZones } from './layout.js?v=phase-3'
import { dispatchZoneEvent } from './actions.js?v=phase-3'
import { effectiveAdaptationCeiling } from './local-adaptation.js?v=fast-recovery'
import { DetectionRuntime } from './detection-runtime.js?v=phase-2d'
import { FRAME_FALLBACK_INTERVAL_MS, LOCAL_ADAPTATION, REFERENCE_POLICY, TELEMETRY_PAINT_INTERVAL_MS } from './detection-policy.js'

const STORAGE_KEY = 'dance-keys-settings-v2'
const PERCENTAGES_KEY = 'dance-keys-show-percentages'
const MUSIC_KEY = 'dance-keys-music-v1'
const CAMERA_KEY = 'dance-keys-camera-v1'
const $ = (id) => document.getElementById(id)
const stage = $('stage')
const context = stage.getContext('2d')
const frameCanvas = document.createElement('canvas')
frameCanvas.width = FRAME_WIDTH
frameCanvas.height = FRAME_HEIGHT
const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true })

let settings = loadSettings()
let showPercentages = loadShowPercentages()
let musicSettings = loadMusicSettings()
let cameraFacing = loadCameraFacing()
let layout = createDefaultLayout(settings, musicSettings)
let zones = generateZones(layout)
let zonesById = new Map(zones.map((zone) => [zone.id, zone]))
let tempoTaps = []
let audio = null
let audioStartPromise = null
let stream = null
let video = null
let background = null
let referenceReadyAt = 0
let detection = new DetectionRuntime(zones)
let measurements = zones.map((zone) => ({ zoneId: zone.id, ratio: 0 }))
let flashes = new Map(zones.map((zone) => [zone.id, 0]))
let frameRequest = null
let frameTimer = null
let runId = 0
let calibration = null
let cameraBusy = false
let showTelemetry = false
let telemetryRows = new Map()
let lastTelemetryPaint = -Infinity

function rebuildTelemetryRows() {
  const container = $('telemetry-rows')
  container.replaceChildren()
  telemetryRows = new Map()
  for (const [index, zone] of zones.entries()) {
    const row = document.createElement('div')
    row.className = 'telemetry-row'
    const fields = Array.from({ length: 7 }, () => document.createElement('span'))
    fields[5].className = 'details'
    fields[6].className = 'trace'
    fields[0].textContent = `K${index} ${zone.action?.note ?? ''}`
    row.append(...fields)
    container.append(row)
    telemetryRows.set(zone.id, { row, fields })
  }
  lastTelemetryPaint = -Infinity
}

function seconds(ms) {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`
}

function adaptationLabel(data) {
  switch (data.state) {
    case 'candidate': return `DRIFT ${seconds(data.candidateMs)}/${seconds(data.candidateDwellMs)}`
    case 'adapting': return data.blending ? `ADAPTING ${seconds(data.adaptingMs)}` : 'PAUSED LOW'
    case 'recovering': return 'FINISHING'
    case 'complete': return 'RECALIBRATED'
    case 'grace': return `FROZEN ${seconds(data.graceMs)}`
    case 'occupied': return 'OCCUPIED'
    case 'unstable': return 'UNSTABLE'
    case 'settling': return 'SETTLING'
    default: return 'NORMAL'
  }
}

function renderTelemetry(now = performance.now()) {
  if (!showTelemetry || now - lastTelemetryPaint < TELEMETRY_PAINT_INTERVAL_MS) return
  lastTelemetryPaint = now
  const global = detection.global.snapshot(now)
  const globalLabel = {
    normal: 'NORMAL', waiting: 'WAITING FOR HISTORY', candidate: `IDLE ${seconds(global.idleMs)}/${seconds(global.idleDwellMs)}`,
    verifying: `VERIFYING ${seconds(global.verificationMs)}/${seconds(global.verificationDwellMs)}`,
    refreshing: `REFRESHING ${seconds(global.refreshMs)}`,
    blocked: `BLOCKED — ${global.reason}`,
    cooldown: global.cooldownMs > 0 ? `COOLDOWN ${seconds(global.cooldownMs)} remaining`
      : global.clearMs > 0 ? `REARMING ${seconds(global.clearMs)}/${seconds(global.clearDwellMs)}`
        : 'WAITING FOR DRIFT TO CLEAR',
  }[global.state]
  const veto = global.activeCount ? ` · ${global.activeCount} active`
    : global.highCount ? ` · ${global.highCount} high/recent`
      : global.unstableCount ? ` · ${global.unstableCount} unstable` : ''
  const manualHint = global.state === 'blocked' && (global.activeCount || global.highCount)
    ? ' · If the camera moved, clear the strip and calibrate manually.' : ''
  $('global-telemetry-status').textContent = `GLOBAL: ${background ? globalLabel : 'WAITING FOR REFERENCE'} · safe low zones ${global.driftCount}/${global.requiredDriftCount}${veto}${manualHint}`
  const symbols = '▁▂▃▄▅▆▇█'
  for (const [index, zone] of zones.entries()) {
    const { row, fields } = telemetryRows.get(zone.id)
    const data = detection.tracker.snapshot(zone.id, now)
    const local = detection.local.snapshot(zone.id, now)
    const raw = calibration ? measurements[index].ratio : data.rawRatio
    fields[1].textContent = background ? `${Math.round(raw * 100)}%` : '—'
    fields[2].textContent = calibration ? 'CAL' : data.triggerState === 'active' ? 'ACTIVE' : 'armed'
    fields[3].textContent = calibration ? 'CAL' : !background ? 'WAIT REF'
      : detection.global.suspendsLocal() ? 'PAUSED GLOBAL' : adaptationLabel(local)
    const recentValues = data.history.filter(({ at }) => at >= now - LOCAL_ADAPTATION.stabilityWindowMs)
      .map(({ ratio }) => ratio)
    recentValues.push(data.rawRatio)
    fields[4].textContent = `R${Math.round((Math.max(...recentValues) - Math.min(...recentValues)) * 100)}%`
    fields[5].textContent = `idle ${seconds(data.inactiveMs)}   T ${seconds(data.sinceTriggerMs)}   R ${seconds(data.sinceReleaseMs)}`
    fields[6].textContent = data.history.slice(-28).map(({ ratio }) => symbols[Math.min(7, Math.floor(ratio * 10))]).join('')
    row.dataset.state = detection.global.suspendsLocal() ? 'paused' : local.state
    row.dataset.trigger = data.triggerState
    row.title = `${zone.id}: recent mean ${Math.round(data.recent.mean * 100)}%, standard deviation ${(data.recent.standardDeviation * 100).toFixed(1)}%, largest sampled rise ${Math.round(data.recent.largestRise * 100)}%`
  }
}

function rebuildZones(resetTracker = false) {
  layout = createDefaultLayout(settings, musicSettings)
  zones = generateZones(layout)
  zonesById = new Map(zones.map((zone) => [zone.id, zone]))
  const previous = new Map(measurements.map(({ zoneId, ratio }) => [zoneId, ratio]))
  measurements = zones.map((zone) => ({ zoneId: zone.id, ratio: previous.get(zone.id) ?? 0 }))
  flashes = new Map(zones.map((zone) => [zone.id, flashes.get(zone.id) ?? 0]))
  if (resetTracker) {
    audio?.allNotesOff()
    detection = new DetectionRuntime(zones)
  }
  if (showTelemetry) rebuildTelemetryRows()
}

function loadSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}) }
  catch { return normalizeSettings() }
}

function loadShowPercentages() {
  try { return localStorage.getItem(PERCENTAGES_KEY) === 'true' }
  catch { return false }
}

function loadMusicSettings() {
  try { return normalizeMusicSettings(JSON.parse(localStorage.getItem(MUSIC_KEY)) ?? {}) }
  catch { return normalizeMusicSettings() }
}

function loadCameraFacing() {
  try { return localStorage.getItem(CAMERA_KEY) === 'environment' ? 'environment' : 'user' }
  catch { return 'user' }
}

function setCameraFacing(mode) {
  cameraFacing = mode
  $('camera-facing').value = mode
  try { localStorage.setItem(CAMERA_KEY, mode) }
  catch { $('settings-status').textContent = 'Camera choice could not be saved in this browser.' }
}

function saveMusicSettings() {
  try { localStorage.setItem(MUSIC_KEY, JSON.stringify(musicSettings)) }
  catch { $('settings-status').textContent = 'Music settings could not be saved in this browser.' }
}

function saveShowPercentages() {
  try { localStorage.setItem(PERCENTAGES_KEY, String(showPercentages)) }
  catch { $('settings-status').textContent = 'Display preference could not be saved in this browser.' }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }
  catch { $('settings-status').textContent = 'Settings could not be saved in this browser.' }
}

function formatSetting(name, value) {
  if (name === 'zoneHeight') return `${Number((value * 100).toFixed(1))}%`
  if (name === 'pressThreshold' || name === 'adaptationCeiling' || name === 'zonePosition') return `${Math.round(value * 100)}%`
  if (name === 'cooldownMs') return `${value} ms`
  return String(value)
}

function syncControls() {
  for (const [name, value] of Object.entries(settings)) {
    $(name).value = value
    $(`${name}-value`).textContent = formatSetting(name, value)
  }
  $('recommended-sensitivity').hidden = settings.pressThreshold === DEFAULT_SETTINGS.pressThreshold
  const effectiveLimit = effectiveAdaptationCeiling(settings)
  const ceilingHelp = settings.adaptationCeiling > effectiveLimit + 0.001
    ? 'Step sensitivity caps this limit. Raise Step sensitivity above the drift peaks to permit a higher limit.'
    : 'Set this above the drift peaks. Triggered keys cannot self-calibrate.'
  $('adaptationCeiling-effective').textContent = `Effective limit: ${Number((effectiveLimit * 100).toFixed(1))}%. ${ceilingHelp}`
  render()
}

function syncMusicControls() {
  for (const name of ['tonic', 'mode', 'octave', 'sound', 'noteMode', 'delayDivision', 'bpm']) {
    $(name).value = musicSettings[name]
  }
  const envelope = effectiveEnvelope(musicSettings)
  for (const name of ['attack', 'decay', 'sustain', 'release']) {
    $(name).value = envelope[name]
    $(`${name}-value`).textContent = name === 'sustain'
      ? `${Math.round(envelope[name] * 100)}%` : `${Number(envelope[name].toFixed(3))} s`
  }
  for (const name of ['reverbMix', 'delayMix']) {
    const percent = Math.round(musicSettings[name] * 100)
    $(name).value = Math.min(musicSettings[name], Number($(name).max))
    $(`${name}-number`).value = percent
    $(`${name}-value`).textContent = `${percent}%`
  }
  $('reverbOn').checked = musicSettings.reverbOn
  $('delayOn').checked = musicSettings.delayOn
  $('bpm-value').textContent = `${musicSettings.bpm} BPM`
  render()
}

function updateMusic(name, value) {
  if (['tonic', 'mode', 'octave', 'sound', 'noteMode'].includes(name)) audio?.allNotesOff()
  musicSettings = normalizeMusicSettings({ ...musicSettings, [name]: value })
  rebuildZones()
  saveMusicSettings()
  audio?.setSettings(musicSettings)
  syncMusicControls()
}

function setPanel(open) {
  $('settings-panel').hidden = !open
  $('settings-toggle').setAttribute('aria-expanded', String(open))
  if (!open) $('settings-toggle').focus()
  else {
    $('settings-panel').scrollTop = 0
    $('settings-close').focus()
  }
  render()
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  stage.width = Math.round(window.innerWidth * dpr)
  stage.height = Math.round(window.innerHeight * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}

function videoRect() {
  const width = window.innerWidth
  const height = window.innerHeight
  const aspect = (video?.videoWidth || FRAME_WIDTH) / (video?.videoHeight || FRAME_HEIGHT)
  const w = Math.min(width, height * aspect)
  const h = w / aspect
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}

function render() {
  const width = window.innerWidth
  const height = window.innerHeight
  context.fillStyle = '#10131b'
  context.fillRect(0, 0, width, height)
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

  const r = videoRect()
  context.save()
  context.translate(r.x + r.w, r.y)
  context.scale(-1, 1)
  context.drawImage(video, 0, 0, r.w, r.h)
  context.restore()

  const strip = layout.modules[0].transform
  const y = r.y + strip.y * r.h
  const h = strip.height * r.h
  const now = performance.now()
  const showReadings = showPercentages
  const compactZone = h < 36
  const labelsBelow = y < 36
  for (const [index, zone] of zones.entries()) {
    const { x: cameraX, width: cameraWidth } = zone.geometry
    const x = r.x + (1 - cameraX - cameraWidth) * r.w
    const keyWidth = cameraWidth * r.w
    const ratio = measurements[index].ratio
    const active = now - flashes.get(zone.id) < 250
    const occupied = ratio >= settings.pressThreshold
    context.fillStyle = active ? '#61ef9bb3' : occupied ? '#ffd34aa6' : '#ffffff32'
    context.fillRect(x + 1, y, Math.max(0, keyWidth - 2), h)
    context.strokeStyle = active ? '#61ef9b' : '#ffffff99'
    context.lineWidth = active ? 2 : 1
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, keyWidth - 1), Math.max(1, h - 1))
    context.lineWidth = 1
    context.fillStyle = compactZone ? '#fff' : active || occupied ? '#19202d' : '#fff'
    context.shadowColor = '#000'
    context.shadowBlur = compactZone || (!active && !occupied) ? 5 : 0
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `600 ${Math.max(10, Math.min(16, keyWidth * 0.32))}px system-ui`
    const labelY = compactZone ? (labelsBelow ? y + h + 13 : y - 13) : y + h * (showReadings ? 0.4 : 0.5)
    context.fillText(zone.action.note, x + keyWidth / 2, labelY)
    if (showReadings) {
      context.font = `${Math.max(10, Math.min(13, keyWidth * 0.27))}px system-ui`
      const percentageY = compactZone ? (labelsBelow ? y + h + 29 : y - 29) : y + h * 0.68
      context.fillText(`${Math.round(ratio * 100)}%`, x + keyWidth / 2, percentageY)
    }
    context.shadowBlur = 0
    const local = !calibration && background && !detection.global.suspendsLocal()
      ? detection.local.snapshot(zone.id, now) : null
    if (!active && local && ['candidate', 'adapting', 'recovering', 'complete'].includes(local.state)) {
      const barX = x + 2
      const barWidth = Math.max(0, keyWidth - 4)
      const barHeight = Math.max(4, Math.min(7, h * 0.35))
      const barY = h >= 12 ? y + h - barHeight - 1 : y >= 9 ? y - barHeight - 3 : y + h + 3
      const candidate = local.state === 'candidate'
      const complete = local.state === 'complete'
      const progress = candidate ? Math.min(1, local.candidateMs / local.candidateDwellMs)
        : complete ? 1 : Math.max(0.06, local.recoveryProgress)
      context.fillStyle = '#10131bcc'
      context.fillRect(barX, barY, barWidth, barHeight)
      context.fillStyle = candidate ? '#ffb84d' : complete ? '#f4fbff' : '#4bd4ff'
      if (complete) context.globalAlpha = Math.max(0, 1 - local.completeMs / local.completionFlashMs)
      context.fillRect(barX, barY, barWidth * progress, barHeight)
      context.globalAlpha = 1
    }
  }
  const global = detection.global.snapshot(now)
  if (showTelemetry && global.state === 'refreshing') {
    const progress = Math.min(1, global.refreshMs / detection.global.config.refreshDurationMs)
    const barY = y >= 12 ? y - 10 : y + h + 5
    context.fillStyle = '#10131bdd'
    context.fillRect(r.x, barY, r.w, 5)
    context.fillStyle = '#b68cff'
    context.fillRect(r.x, barY, r.w * progress, 5)
  }
  if (!$('settings-panel').hidden) {
    context.strokeStyle = '#ffcf6c'
    context.lineWidth = 2
    // Keep the settings outline outside the playable strip, including when
    // the strip is thinner than the outline itself.
    context.strokeRect(r.x + strip.x * r.w - 2, y - 2, strip.width * r.w + 4, h + 4)
    context.lineWidth = 1
  }
}

function processFrame(id) {
  if (id !== runId || !video) return
  try {
    frameContext.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    const current = frameContext.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data
    if (background) {
      measurements = measureZones(current, background, FRAME_WIDTH, FRAME_HEIGHT, zones, settings)
      if (!calibration) {
        const now = performance.now()
        for (const event of detection.tracker.update(measurements, now, settings)) {
          if (dispatchZoneEvent(event, zonesById, audio)) flashes.set(event.zoneId, now)
        }
        const alphaByZone = detection.updateCalibration(measurements, now, settings)
        adaptBackground(background, current, FRAME_WIDTH, FRAME_HEIGHT, zones, alphaByZone)
      }
    } else if (performance.now() >= referenceReadyAt) {
      background = new Float32Array(current)
      measurements = zones.map((zone) => ({ zoneId: zone.id, ratio: 0 }))
      detection.reset()
      if (calibration) finishCalibration()
      $('welcome').hidden = true
      $('stop').hidden = false
    }
    render()
    renderTelemetry()
    scheduleFrame(id)
  } catch (error) {
    stop(cameraError(error))
  }
}

function scheduleFrame(id) {
  if (!video || id !== runId) return
  if ('requestVideoFrameCallback' in video) {
    frameRequest = video.requestVideoFrameCallback(() => processFrame(id))
  } else {
    frameTimer = window.setTimeout(() => processFrame(id), FRAME_FALLBACK_INTERVAL_MS)
  }
}

function endCalibration() {
  if (!calibration) return false
  window.clearTimeout(calibration.timer)
  window.clearInterval(calibration.progressTimer)
  calibration = null
  $('calibrate').disabled = false
  $('calibrate').textContent = 'Calibrate empty floor'
  $('calibration-progress').hidden = true
  render()
  return true
}

function finishCalibration() {
  if (!endCalibration()) return
  $('settings-status').textContent = `Floor reference refreshed. Step sensitivity remains ${formatSetting('pressThreshold', settings.pressThreshold)}.`
}

function cameraError(error) {
  if (!window.isSecureContext) return 'Camera access needs localhost or HTTPS.'
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Allow access in your browser and try again.'
  if (error?.name === 'NotFoundError') return 'No camera was found on this device.'
  if (error?.name === 'OverconstrainedError') return 'That camera is not available on this device.'
  if (error?.name === 'NotReadableError') return 'The camera is busy in another app. Close it there and try again.'
  return `Could not start: ${error?.message || 'unknown camera or audio error'}`
}

async function ensureAudio() {
  if (audioStartPromise) return audioStartPromise
  if (audio?.context?.state === 'running') return
  if (audio?.context?.state === 'suspended') {
    await audio.context.resume()
    return
  }
  if (!audioStartPromise) {
    audio = new DanceAudio()
    audioStartPromise = audio.start(musicSettings).finally(() => { audioStartPromise = null })
  }
  await audioStartPromise
}

function releaseCamera() {
  audio?.allNotesOff()
  if (video && frameRequest != null && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(frameRequest)
  window.clearTimeout(frameTimer)
  frameRequest = null
  frameTimer = null
  if (stream) {
    for (const track of stream.getTracks()) { track.onended = null; track.stop() }
  }
  if (video) { video.pause(); video.srcObject = null }
  stream = null
  video = null
  background = null
  referenceReadyAt = 0
  endCalibration()
  measurements = zones.map((zone) => ({ zoneId: zone.id, ratio: 0 }))
  flashes = new Map(zones.map((zone) => [zone.id, 0]))
  detection.reset()
  render()
  renderTelemetry()
}

async function openCamera(mode, id, exact = false) {
  const acquired = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: FRAME_WIDTH, height: FRAME_HEIGHT, facingMode: exact ? { exact: mode } : mode },
  })
  if (id !== runId) { acquired.getTracks().forEach((track) => track.stop()); return null }
  const nextVideo = document.createElement('video')
  nextVideo.autoplay = true
  nextVideo.muted = true
  nextVideo.playsInline = true
  nextVideo.srcObject = acquired
  stream = acquired
  video = nextVideo
  try { await nextVideo.play() }
  catch (error) {
    if (id === runId) releaseCamera()
    throw error
  }
  if (id !== runId) return null
  const track = acquired.getVideoTracks()[0]
  track.onended = () => stop('Camera disconnected. Start again to reconnect.')
  background = null
  referenceReadyAt = performance.now() + REFERENCE_POLICY.startupCaptureDelayMs
  scheduleFrame(id)
  const actual = track.getSettings?.().facingMode
  return actual === 'user' || actual === 'environment' ? actual : mode
}

async function start() {
  const button = $('start')
  button.disabled = true
  cameraBusy = true
  $('camera-facing').disabled = true
  $('status').textContent = 'Starting sound and waiting for camera permission…'
  const id = ++runId
  try {
    await ensureAudio()
    if (id !== runId) return
    const actual = await openCamera(cameraFacing, id)
    if (actual == null) return
    setCameraFacing(actual)
    $('status').textContent = 'Keep the key strip clear while the floor reference is captured…'
  } catch (error) {
    if (id === runId) await stop(cameraError(error))
  } finally {
    button.disabled = false
    if (id === runId) { cameraBusy = false; $('camera-facing').disabled = false }
  }
}

async function switchCamera(mode) {
  if (mode === cameraFacing) return
  if (!video) {
    setCameraFacing(mode)
    $('settings-status').textContent = `${mode === 'user' ? 'Front' : 'Rear'} camera selected. Start the camera when ready.`
    return
  }
  const previous = cameraFacing
  const id = ++runId
  cameraBusy = true
  $('camera-facing').disabled = true
  $('settings-status').textContent = 'Switching cameras. Keep the key strip clear for a new floor reference…'
  releaseCamera()
  try {
    const actual = await openCamera(mode, id, true)
    if (actual == null) return
    setCameraFacing(actual)
    $('settings-status').textContent = actual === mode
      ? `${mode === 'user' ? 'Front' : 'Rear'} camera ready. Capturing a new floor reference…`
      : 'This device kept the same camera. Try the other choice again.'
  } catch (error) {
    if (id !== runId) return
    $('camera-facing').value = previous
    try {
      const restored = await openCamera(previous, id)
      if (restored == null) return
      setCameraFacing(restored)
      $('settings-status').textContent = `${cameraError(error)} The previous camera is running again.`
    } catch {
      await stop(`Could not restart the camera after switching: ${cameraError(error)}`)
    }
  } finally {
    if (id === runId) { cameraBusy = false; $('camera-facing').disabled = false }
  }
}

async function stop(message = 'Camera stopped. Start again when ready.') {
  runId++
  releaseCamera()
  cameraBusy = false
  $('camera-facing').disabled = false
  $('camera-facing').value = cameraFacing
  $('welcome').hidden = false
  $('stop').hidden = true
  $('status').textContent = message
  if (audio) await audio.stop()
  audio = null
  render()
}

for (const name of Object.keys(DEFAULT_SETTINGS)) {
  $(name).addEventListener('input', (event) => {
    settings = normalizeSettings({ ...settings, [name]: Number(event.target.value) })
    saveSettings()
    if (name === 'zoneHeight' || name === 'zonePosition') rebuildZones(true)
    if (name === 'pixelStep') {
      audio?.allNotesOff()
      detection.reset()
    }
    if (name !== 'pixelStep' && name !== 'zoneHeight' && name !== 'zonePosition') detection.global.reset()
    syncControls()
  })
}
for (const name of ['tonic', 'mode', 'octave', 'sound', 'noteMode', 'delayDivision', 'bpm', 'reverbMix', 'delayMix', 'reverbOn', 'delayOn']) {
  const input = $(name)
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' || name === 'octave' ? Number(input.value) : input.value
    if (name === 'bpm') tempoTaps = []
    updateMusic(name, value)
  })
}
for (const name of ['attack', 'decay', 'sustain', 'release']) {
  $(name).addEventListener('input', (event) => {
    updateMusic('envelope', { ...effectiveEnvelope(musicSettings), [name]: Number(event.target.value) })
  })
}
$('reset-envelope').addEventListener('click', () => updateMusic('envelope', null))
for (const name of ['reverbMix', 'delayMix']) {
  $(`${name}-number`).addEventListener('change', (event) => {
    const input = event.target
    if (input.value !== '' && input.validity.valid && Number.isFinite(Number(input.value))) {
      updateMusic(name, Number(input.value) / 100)
    } else {
      syncMusicControls()
    }
  })
}
$('tap-tempo').addEventListener('click', () => {
  const result = addTempoTap(tempoTaps, performance.now())
  tempoTaps = result.taps
  if (result.bpm == null) {
    $('tap-hint').textContent = 'Tap again in time.'
  } else {
    updateMusic('bpm', result.bpm)
    $('tap-hint').textContent = `${result.bpm} BPM from your taps.`
  }
})
$('preview-sound').addEventListener('click', async () => {
  const button = $('preview-sound')
  button.disabled = true
  try {
    await ensureAudio()
    const action = zones[Math.floor(zones.length / 2)].action
    audio.trigger(action.note, { sound: action.sound, envelope: action.envelope })
    $('settings-status').textContent = 'Previewing the selected sound.'
  } catch (error) {
    $('settings-status').textContent = `Sound preview failed: ${error.message}`
  } finally {
    button.disabled = false
  }
})
$('start').addEventListener('click', start)
$('stop').addEventListener('click', () => stop())
$('camera-facing').value = cameraFacing
$('camera-facing').addEventListener('change', (event) => {
  if (cameraBusy) { event.target.value = cameraFacing; return }
  switchCamera(event.target.value)
})
$('settings-toggle').addEventListener('click', () => setPanel($('settings-panel').hidden))
$('settings-close').addEventListener('click', () => setPanel(false))
$('show-percentages').checked = showPercentages
$('show-percentages').addEventListener('change', (event) => {
  showPercentages = event.target.checked
  saveShowPercentages()
  render()
})
$('show-telemetry').addEventListener('change', (event) => {
  showTelemetry = event.target.checked
  $('telemetry-panel').hidden = !showTelemetry
  if (showTelemetry) {
    rebuildTelemetryRows()
    renderTelemetry()
  }
})
$('telemetry-close').addEventListener('click', () => {
  showTelemetry = false
  $('show-telemetry').checked = false
  $('telemetry-panel').hidden = true
})
$('reset').addEventListener('click', async () => {
  if (cameraBusy) return
  settings = normalizeSettings()
  musicSettings = normalizeMusicSettings(DEFAULT_MUSIC)
  rebuildZones(true)
  tempoTaps = []
  showPercentages = false
  $('show-percentages').checked = false
  saveSettings()
  saveMusicSettings()
  saveShowPercentages()
  syncControls()
  syncMusicControls()
  audio?.setSettings(musicSettings)
  $('tap-hint').textContent = 'Tap at least twice to set BPM.'
  $('settings-status').textContent = 'Default settings restored.'
  if (cameraFacing !== 'user') await switchCamera('user')
})
$('recommended-sensitivity').addEventListener('click', () => {
  settings = normalizeSettings({ ...settings, pressThreshold: DEFAULT_SETTINGS.pressThreshold })
  saveSettings()
  syncControls()
  $('settings-status').textContent = 'Step sensitivity set to 30%.'
})
$('calibrate').addEventListener('click', () => {
  if (!video) { $('settings-status').textContent = 'Start the camera before calibrating.'; return }
  audio?.allNotesOff()
  const now = performance.now()
  background = null
  detection.reset()
  referenceReadyAt = now + REFERENCE_POLICY.manualCaptureDelayMs
  calibration = { timer: null, progressTimer: null }
  calibration.timer = window.setTimeout(() => {
    if (!endCalibration()) return
    referenceReadyAt = Infinity
    $('settings-status').textContent = 'No camera frame was available. Try recalibrating.'
  }, REFERENCE_POLICY.manualCaptureTimeoutMs)
  calibration.progressTimer = window.setInterval(() => {
    $('calibration-progress').value = Math.min(REFERENCE_POLICY.manualCaptureDelayMs, performance.now() - now)
  }, REFERENCE_POLICY.manualProgressIntervalMs)
  measurements = zones.map((zone) => ({ zoneId: zone.id, ratio: 0 }))
  $('calibrate').disabled = true
  $('calibrate').textContent = 'Calibrating…'
  $('calibration-progress').value = 0
  $('calibration-progress').hidden = false
  $('settings-status').textContent = 'Hold the strip clear while capturing a new floor reference. Step sensitivity will stay the same.'
  render()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('settings-panel').hidden) setPanel(false)
  if (event.key.toLowerCase() === 'd' && !event.repeat && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    setPanel($('settings-panel').hidden)
  }
})
window.addEventListener('resize', resize)
syncControls()
syncMusicControls()
resize()
