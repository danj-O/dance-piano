import {
  FRAME_HEIGHT, FRAME_WIDTH, KEY_COUNT, DEFAULT_SETTINGS,
  KeyTracker, adaptBackground, analyzeOccupancy, calibrationThreshold, normalizeSettings, zoneBounds,
} from './detector.js'
import { DanceAudio } from './audio.js?v=mobile-compat'
import { DEFAULT_MUSIC, addTempoTap, buildNotes, normalizeMusicSettings } from './music.js?v=mobile-compat'

const STORAGE_KEY = 'dance-keys-settings-v2'
const PERCENTAGES_KEY = 'dance-keys-show-percentages'
const MUSIC_KEY = 'dance-keys-music-v1'
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
// Camera order is reversed by the mirror: low notes appear on screen left.
let notes = buildNotes(musicSettings, KEY_COUNT).reverse()
let tempoTaps = []
let audio = null
let audioStartPromise = null
let stream = null
let video = null
let background = null
let referenceReadyAt = 0
let tracker = new KeyTracker()
let ratios = new Array(KEY_COUNT).fill(0)
let flashes = new Array(KEY_COUNT).fill(0)
let frameRequest = null
let frameTimer = null
let runId = 0
let calibration = null

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
  if (name === 'pressThreshold' || name === 'zonePosition') return `${Math.round(value * 100)}%`
  if (name === 'cooldownMs') return `${value} ms`
  return String(value)
}

function syncControls() {
  for (const [name, value] of Object.entries(settings)) {
    $(name).value = value
    $(`${name}-value`).textContent = formatSetting(name, value)
  }
  render()
}

function syncMusicControls() {
  for (const name of ['tonic', 'mode', 'octave', 'sound', 'delayDivision', 'bpm']) {
    $(name).value = musicSettings[name]
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
  musicSettings = normalizeMusicSettings({ ...musicSettings, [name]: value })
  notes = buildNotes(musicSettings, KEY_COUNT).reverse()
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

  const zone = zoneBounds(settings, FRAME_HEIGHT)
  const y = r.y + zone.top * r.h
  const h = zone.height * r.h
  const keyWidth = r.w / KEY_COUNT
  const now = performance.now()
  const showReadings = calibration !== null || showPercentages
  const compactZone = h < 36
  const labelsBelow = y < 36
  for (let screenKey = 0; screenKey < KEY_COUNT; screenKey++) {
    const cameraKey = KEY_COUNT - 1 - screenKey
    const x = r.x + screenKey * keyWidth
    const ratio = ratios[cameraKey]
    const active = now - flashes[cameraKey] < 250
    const occupied = ratio >= settings.pressThreshold
    context.fillStyle = active ? '#61ef9bb3' : occupied ? '#ffd34aa6' : calibration && ratio >= settings.pressThreshold * 0.5 ? '#ffca7080' : '#ffffff32'
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
    context.fillText(notes[cameraKey], x + keyWidth / 2, labelY)
    if (showReadings) {
      context.font = `${Math.max(10, Math.min(13, keyWidth * 0.27))}px system-ui`
      const percentageY = compactZone ? (labelsBelow ? y + h + 29 : y - 29) : y + h * 0.68
      context.fillText(`${Math.round(ratio * 100)}%`, x + keyWidth / 2, percentageY)
    }
    context.shadowBlur = 0
  }
  if (!$('settings-panel').hidden) {
    context.strokeStyle = '#ffcf6c'
    context.lineWidth = 3
    context.strokeRect(r.x + 1.5, y + 1.5, r.w - 3, Math.max(1, h - 3))
    context.lineWidth = 1
  }
}

function processFrame(id) {
  if (id !== runId || !video) return
  try {
    frameContext.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    const current = frameContext.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data
    if (background) {
      ratios = analyzeOccupancy(current, background, FRAME_WIDTH, FRAME_HEIGHT, settings)
      if (calibration) {
        calibration.samples.push(Math.max(...ratios))
      } else {
        const now = performance.now()
        for (const key of tracker.update(ratios, now, settings)) {
          audio.play(notes[key])
          flashes[key] = now
        }
        adaptBackground(background, current, FRAME_WIDTH, FRAME_HEIGHT, ratios, settings)
      }
    } else if (performance.now() >= referenceReadyAt) {
      background = new Float32Array(current)
      ratios.fill(0)
      tracker = new KeyTracker()
      $('welcome').hidden = true
      $('stop').hidden = false
    }
    render()
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
    frameTimer = window.setTimeout(() => processFrame(id), 50)
  }
}

function endCalibration() {
  if (!calibration) return null
  const samples = calibration.samples
  window.clearTimeout(calibration.timer)
  window.clearInterval(calibration.progressTimer)
  calibration = null
  $('calibrate').disabled = false
  $('calibrate').textContent = 'Calibrate empty floor'
  $('calibration-progress').hidden = true
  render()
  return samples
}

function finishCalibration() {
  const samples = endCalibration()
  if (!samples) return
  const value = calibrationThreshold(samples)
  if (value == null) {
    $('settings-status').textContent = 'No camera frames were available. Try again.'
    return
  }
  settings.pressThreshold = value
  saveSettings()
  syncControls()
  $('settings-status').textContent = `Calibrated. Step sensitivity set to ${formatSetting('pressThreshold', value)}.`
  tracker = new KeyTracker()
}

function cameraError(error) {
  if (!window.isSecureContext) return 'Camera access needs localhost or HTTPS.'
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Allow access in your browser and try again.'
  if (error?.name === 'NotFoundError') return 'No camera was found on this device.'
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

async function start() {
  const button = $('start')
  button.disabled = true
  $('status').textContent = 'Starting sound and waiting for camera permission…'
  const id = ++runId
  try {
    await ensureAudio()
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: FRAME_WIDTH, height: FRAME_HEIGHT, facingMode: 'environment' } })
    if (id !== runId) { stream.getTracks().forEach((track) => track.stop()); return }
    video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    stream.getVideoTracks()[0].onended = () => stop('Camera disconnected. Start again to reconnect.')
    await video.play()
    if (id !== runId) return
    background = null
    referenceReadyAt = performance.now() + 1000
    ratios.fill(0)
    flashes.fill(0)
    tracker = new KeyTracker()
    scheduleFrame(id)
    $('status').textContent = 'Keep the key strip clear while the floor reference is captured…'
  } catch (error) {
    await stop(cameraError(error))
  } finally {
    button.disabled = false
  }
}

async function stop(message = 'Camera stopped. Start again when ready.') {
  runId++
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
    syncControls()
    if (name === 'zoneHeight' || name === 'zonePosition' || name === 'pixelStep') tracker = new KeyTracker()
  })
}
for (const name of ['tonic', 'mode', 'octave', 'sound', 'delayDivision', 'bpm', 'reverbMix', 'delayMix', 'reverbOn', 'delayOn']) {
  const input = $(name)
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' || name === 'octave' ? Number(input.value) : input.value
    if (name === 'bpm') tempoTaps = []
    updateMusic(name, value)
  })
}
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
    audio.play(notes[Math.floor(KEY_COUNT / 2)])
    $('settings-status').textContent = 'Previewing the selected sound.'
  } catch (error) {
    $('settings-status').textContent = `Sound preview failed: ${error.message}`
  } finally {
    button.disabled = false
  }
})
$('start').addEventListener('click', start)
$('stop').addEventListener('click', () => stop())
$('settings-toggle').addEventListener('click', () => setPanel($('settings-panel').hidden))
$('settings-close').addEventListener('click', () => setPanel(false))
$('show-percentages').checked = showPercentages
$('show-percentages').addEventListener('change', (event) => {
  showPercentages = event.target.checked
  saveShowPercentages()
  render()
})
$('reset').addEventListener('click', () => {
  settings = normalizeSettings()
  musicSettings = normalizeMusicSettings(DEFAULT_MUSIC)
  notes = buildNotes(musicSettings, KEY_COUNT).reverse()
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
  tracker = new KeyTracker()
  $('settings-status').textContent = 'Default settings restored.'
})
$('calibrate').addEventListener('click', () => {
  if (!video) { $('settings-status').textContent = 'Start the camera before calibrating.'; return }
  const now = performance.now()
  background = null
  referenceReadyAt = now + 500
  calibration = { samples: [], timer: null, progressTimer: null }
  calibration.timer = window.setTimeout(finishCalibration, 2500)
  calibration.progressTimer = window.setInterval(() => {
    $('calibration-progress').value = Math.min(2500, performance.now() - now)
  }, 100)
  ratios.fill(0)
  $('calibrate').disabled = true
  $('calibrate').textContent = 'Calibrating…'
  $('calibration-progress').value = 0
  $('calibration-progress').hidden = false
  $('settings-status').textContent = 'Capturing the empty floor, then measuring noise for two seconds. Keep the strip clear.'
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
