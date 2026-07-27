let video
let prevFrame

let synth

const NUM_KEYS = 16
let keys = []

const notes = ["D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4", "B3", "A3", "G3", "F3", "E3", "D3", "C3"]

const videoWidth = 320
const videoHeight = 240

// Live-tweakable settings — dev panel sliders update these at runtime
const settings = {
  threshold: 60,
  cooldown: 375,
  motionTrigger: 25,
  keyZoneHeight: 0.15,
  keyZonePosition: 0.94,
  noteLabelSize: 16,
  pixelStep: 2,
  noteDuration: "8n",
  showDetectionZone: true,
  showMotionCounts: true,
}

let devMode = true // start open so tuning controls are obvious

const canvasDevBtn = { w: 124, h: 36, pad: 16 }

function setup() {
  createCanvas(windowWidth, windowHeight)

  video = createCapture(VIDEO)
  video.size(videoWidth, videoHeight)
  video.hide()

  prevFrame = createImage(videoWidth, videoHeight)

  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.2,
      release: 0.6,
    },
  }).toDestination()

  for (let i = 0; i < NUM_KEYS; i++) {
    keys.push({
      note: notes[i],
      x: i / NUM_KEYS,
      w: 1 / NUM_KEYS,
      last: 0,
      motion: 0,
    })
  }

  document.getElementById("start").onclick = async () => {
    await Tone.start()
    document.getElementById("start").style.display = "none"
  }

  setupDevMode()
  setDevMode(true)
}

function canvasDevBtnRect() {
  return {
    x: canvasDevBtn.pad,
    y: canvasDevBtn.pad,
    w: canvasDevBtn.w,
    h: canvasDevBtn.h,
  }
}

function hitCanvasDevBtn(mx, my) {
  const b = canvasDevBtnRect()
  return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h
}

function setupDevMode() {
  const panel = document.getElementById("dev-panel")
  const toggle = document.getElementById("dev-toggle")

  toggle.onclick = () => setDevMode(!devMode)

  document.addEventListener("keydown", (e) => {
    if (e.key === "d" || e.key === "D") {
      setDevMode(!devMode)
    }
  })

  bindSlider("threshold", (v) => (settings.threshold = v), { min: 1, max: 60, step: 1 })
  bindSlider("motionTrigger", (v) => (settings.motionTrigger = v), { min: 5, max: 400, step: 5 })
  bindSlider("cooldown", (v) => (settings.cooldown = v), { min: 50, max: 1000, step: 25 })
  bindSlider("keyZoneHeight", (v) => (settings.keyZoneHeight = v), { min: 0.05, max: 0.45, step: 0.01, decimals: 2 })
  bindSlider("keyZonePosition", (v) => (settings.keyZonePosition = v), { min: 0, max: 1, step: 0.01, decimals: 2 })
  bindSlider("pixelStep", (v) => (settings.pixelStep = v), { min: 1, max: 6, step: 1 })

  document.getElementById("copy-settings").onclick = () => {
    const json = JSON.stringify(settings, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      document.getElementById("copy-settings").textContent = "Copied!"
      setTimeout(() => {
        document.getElementById("copy-settings").textContent = "Copy settings JSON"
      }, 1500)
    })
  }

  document.getElementById("reset-settings").onclick = () => {
    applySettings({
      threshold: 8,
      cooldown: 250,
      motionTrigger: 75,
      keyZoneHeight: 0.15,
      keyZonePosition: 1,
      noteLabelSize: 16,
      pixelStep: 2,
      noteDuration: "8n",
      showDetectionZone: true,
      showMotionCounts: true,
    })
  }

  syncSlidersFromSettings()
}

function bindSlider(name, setter, { min, max, step, decimals = 0 }) {
  const slider = document.getElementById(`slider-${name}`)
  const valueEl = document.getElementById(`value-${name}`)

  slider.min = min
  slider.max = max
  slider.step = step
  slider.value = settings[name]

  slider.oninput = () => {
    const v = Number(slider.value)
    setter(v)
    valueEl.textContent = decimals > 0 ? v.toFixed(decimals) : v
  }
}

function syncSlidersFromSettings() {
  for (const name of Object.keys(settings)) {
    const slider = document.getElementById(`slider-${name}`)
    const valueEl = document.getElementById(`value-${name}`)
    if (!slider || !valueEl) continue

    slider.value = settings[name]
    const decimals = slider.step.includes(".") ? slider.step.split(".")[1].length : 0
    valueEl.textContent = decimals > 0 ? Number(settings[name]).toFixed(decimals) : settings[name]
  }
}

function applySettings(next) {
  Object.assign(settings, next)
  syncSlidersFromSettings()
}

function setDevMode(on) {
  devMode = on
  document.getElementById("dev-panel").classList.toggle("open", on)
  document.getElementById("dev-toggle").classList.toggle("active", on)
  document.getElementById("dev-toggle").textContent = on ? "⚙ Dev Mode ON" : "⚙ Dev Mode"
}

function keyZoneFractions() {
  const h = settings.keyZoneHeight
  const top = (1 - h) * settings.keyZonePosition
  return { top, h, bottom: top + h }
}

function keyZoneScreenRect() {
  const z = keyZoneFractions()
  return { x: 0, y: height * z.top, w: width, h: height * z.h }
}

function keyZoneCameraRect(vh) {
  const z = keyZoneFractions()
  return { y1: floor(vh * z.top), y2: floor(vh * z.bottom) }
}

// Map camera key index to screen x (mirror flips left/right)
function keyScreenRect(k) {
  const zone = keyZoneScreenRect()
  const pw = k.w * width
  const px = width - (k.x + k.w) * width
  return { x: px, y: zone.y, w: pw, h: zone.h }
}

function draw() {
  background(0)

  push()
  translate(width, 0)
  scale(-1, 1)
  image(video, 0, 0, width, height)
  pop()

  let vw = video.width
  let vh = video.height

  video.loadPixels()
  prevFrame.loadPixels()

  let zone = keyZoneCameraRect(vh)

  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]

    let x1 = floor(k.x * vw)
    let x2 = floor((k.x + k.w) * vw)
    let y1 = zone.y1
    let y2 = zone.y2

    let motion = 0

    for (let y = y1; y < y2; y += settings.pixelStep) {
      for (let x = x1; x < x2; x += settings.pixelStep) {
        let idx = (x + y * vw) * 4

        let r1 = video.pixels[idx]
        let g1 = video.pixels[idx + 1]
        let b1 = video.pixels[idx + 2]

        let r2 = prevFrame.pixels[idx]
        let g2 = prevFrame.pixels[idx + 1]
        let b2 = prevFrame.pixels[idx + 2]

        let diff = abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)

        if (diff > settings.threshold) {
          motion++
        }
      }
    }

    k.motion = motion

    let now = millis()
    k.triggered = motion > settings.motionTrigger && now - k.last > settings.cooldown

    if (k.triggered) {
      k.last = now
      synth.triggerAttackRelease(k.note, settings.noteDuration)
    }
  }

  drawKeyZone()

  if (devMode) {
    drawDevHud()
  }

  prevFrame.copy(video, 0, 0, video.width, video.height, 0, 0, prevFrame.width, prevFrame.height)

  drawCanvasUi()
}

function drawKeyZone() {
  const zone = keyZoneScreenRect()

  if (devMode && settings.showDetectionZone) {
    noFill()
    stroke(255, 200, 0, 220)
    strokeWeight(3)
    rect(zone.x, zone.y, zone.w, zone.h)
    noStroke()
  }

  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]
    let r = keyScreenRect(k)

    if (k.triggered) {
      fill(0, 255, 0, 120)
    } else if (devMode && k.motion > settings.motionTrigger * 0.5) {
      fill(255, 180, 0, 100)
    } else {
      fill(255, 255, 255, 30)
    }

    noStroke()
    rect(r.x, r.y, r.w, r.h)

    fill(255)
    textAlign(CENTER, CENTER)
    textSize(settings.noteLabelSize)
    text(k.note, r.x + r.w / 2, r.y + r.h / 2 - 8)

    if (devMode && settings.showMotionCounts) {
      fill(k.motion > settings.motionTrigger ? 0 : 255, k.motion > settings.motionTrigger ? 255 : 200, 100)
      textSize(12)
      text(`${k.motion}`, r.x + r.w / 2, r.y + r.h / 2 + 12)
    }
  }
}

function drawCanvasUi() {
  const b = canvasDevBtnRect()

  fill(devMode ? 255 : 255, devMode ? 152 : 213, devMode ? 0 : 79, 235)
  stroke(255)
  strokeWeight(2)
  rect(b.x, b.y, b.w, b.h, 8)

  fill(20)
  noStroke()
  textAlign(CENTER, CENTER)
  textSize(14)
  textStyle(BOLD)
  text(devMode ? "DEV ON" : "DEV MODE", b.x + b.w / 2, b.y + b.h / 2)
  textStyle(NORMAL)

  if (!devMode) {
    fill(0, 0, 0, 170)
    noStroke()
    rect(12, height - 40, 260, 30, 6)
    fill(255, 220, 100)
    textAlign(LEFT, CENTER)
    textSize(13)
    text("Press D or click DEV MODE (top-left)", 20, height - 25)
  }
}

function mousePressed() {
  if (hitCanvasDevBtn(mouseX, mouseY)) {
    setDevMode(!devMode)
  }
}

function drawDevHud() {
  fill(0, 0, 0, 160)
  noStroke()
  rect(12, 60, 280, 72, 6)

  fill(255, 220, 100)
  textAlign(LEFT, TOP)
  textSize(13)
  text("DEV MODE — press D to toggle", 22, 68)
  fill(200)
  text(`threshold: ${settings.threshold}  |  trigger at: ${settings.motionTrigger}+ pixels`, 22, 86)
  text(
    `cooldown: ${settings.cooldown}ms  |  zone: ${(settings.keyZoneHeight * 100).toFixed(0)}% @ ${(settings.keyZonePosition * 100).toFixed(0)}%`,
    22,
    102,
  )
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
}
