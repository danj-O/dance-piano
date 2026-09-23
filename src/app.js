import {
  FRAME_HEIGHT, FRAME_WIDTH, KEY_COUNT, DEFAULT_SETTINGS,
  KeyTracker, analyzeMotion, calibrationThreshold, normalizeSettings, zoneBounds,
} from './detector.js'
import { PianoAudio } from './audio.js'

// Camera order is reversed by the mirror: low notes appear on screen left.
const NOTES = ['D5', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3', 'G3', 'F3', 'E3', 'D3', 'C3']
const STORAGE_KEY = 'dance-keys-settings-v2'
const $ = (id) => document.getElementById(id)
const stage = $('stage')
const context = stage.getContext('2d')
const frameCanvas = document.createElement('canvas')
frameCanvas.width = FRAME_WIDTH
frameCanvas.height = FRAME_HEIGHT
const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true })

let settings = loadSettings()
let audio = null
let stream = null
let video = null
let previous = null
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

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }
  catch { $('settings-status').textContent = 'Settings could not be saved in this browser.' }
}

function formatSetting(name, value) {
  if (name === 'pressThreshold' || name === 'zoneHeight' || name === 'zonePosition') return `${Math.round(value * 100)}%`
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

function setPanel(open) {
  $('settings-panel').hidden = !open
  $('settings-toggle').setAttribute('aria-expanded', String(open))
  if (!open) $('settings-toggle').focus()
  else $('settings-close').focus()
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
  for (let screenKey = 0; screenKey < KEY_COUNT; screenKey++) {
    const cameraKey = KEY_COUNT - 1 - screenKey
    const x = r.x + screenKey * keyWidth
    const ratio = ratios[cameraKey]
    const active = now - flashes[cameraKey] < 180
    context.fillStyle = active ? '#61ef9b8c' : ratio >= settings.pressThreshold * 0.5 ? '#ffca7080' : '#ffffff32'
    context.fillRect(x + 1, y, Math.max(0, keyWidth - 2), h)
    context.strokeStyle = '#ffffff99'
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, keyWidth - 1), h - 1)
    context.fillStyle = '#fff'
    context.shadowColor = '#000'
    context.shadowBlur = 5
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `600 ${Math.max(10, Math.min(16, keyWidth * 0.32))}px system-ui`
    context.fillText(NOTES[cameraKey], x + keyWidth / 2, y + h * ($('settings-panel').hidden ? 0.5 : 0.4))
    if (!$('settings-panel').hidden) {
      context.font = `${Math.max(10, Math.min(13, keyWidth * 0.27))}px system-ui`
      context.fillText(`${Math.round(ratio * 100)}%`, x + keyWidth / 2, y + h * 0.68)
    }
    context.shadowBlur = 0
  }
  if (!$('settings-panel').hidden) {
    context.strokeStyle = '#ffcf6c'
    context.lineWidth = 3
    context.strokeRect(r.x + 1.5, y + 1.5, r.w - 3, h - 3)
    context.lineWidth = 1
  }
}

function processFrame(id) {
  if (id !== runId || !video) return
  try {
    frameContext.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    const current = frameContext.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data
    if (previous) {
      ratios = analyzeMotion(current, previous, FRAME_WIDTH, FRAME_HEIGHT, settings)
      if (calibration) {
        calibration.samples.push(Math.max(...ratios))
        if (performance.now() >= calibration.until) finishCalibration()
      } else {
        const now = performance.now()
        for (const key of tracker.update(ratios, now, settings)) {
          audio.play(NOTES[key])
          flashes[key] = now
        }
      }
      previous.set(current)
    } else {
      previous = new Uint8ClampedArray(current)
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

function finishCalibration() {
  const value = calibrationThreshold(calibration.samples)
  calibration = null
  $('calibrate').disabled = false
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

async function start() {
  const button = $('start')
  button.disabled = true
  $('status').textContent = 'Starting sound and waiting for camera permission…'
  const id = ++runId
  try {
    audio = new PianoAudio()
    await audio.start()
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: FRAME_WIDTH, height: FRAME_HEIGHT, facingMode: 'environment' } })
    if (id !== runId) { stream.getTracks().forEach((track) => track.stop()); return }
    video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    stream.getVideoTracks()[0].onended = () => stop('Camera disconnected. Start again to reconnect.')
    await video.play()
    previous = null
    ratios.fill(0)
    flashes.fill(0)
    tracker = new KeyTracker()
    scheduleFrame(id)
    $('status').textContent = 'Waiting for the first camera frame…'
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
  previous = null
  calibration = null
  $('calibrate').disabled = false
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
$('start').addEventListener('click', start)
$('stop').addEventListener('click', () => stop())
$('settings-toggle').addEventListener('click', () => setPanel($('settings-panel').hidden))
$('settings-close').addEventListener('click', () => setPanel(false))
$('reset').addEventListener('click', () => {
  settings = normalizeSettings()
  saveSettings()
  syncControls()
  tracker = new KeyTracker()
  $('settings-status').textContent = 'Default settings restored.'
})
$('calibrate').addEventListener('click', () => {
  if (!video) { $('settings-status').textContent = 'Start the camera before calibrating.'; return }
  calibration = { until: performance.now() + 2000, samples: [] }
  $('calibrate').disabled = true
  $('settings-status').textContent = 'Measuring idle noise for two seconds. Keep the key strip clear.'
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('settings-panel').hidden) setPanel(false)
  if (event.key.toLowerCase() === 'd' && !event.repeat && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    setPanel($('settings-panel').hidden)
  }
})
window.addEventListener('resize', resize)
syncControls()
resize()
