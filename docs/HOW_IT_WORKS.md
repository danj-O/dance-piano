# How It Works

This document explains the architecture of Dance Keys so you can reason about changes and debug behavior.

## Overview

The app runs a continuous loop (`draw()` in p5.js, ~60 fps):

1. Draw the mirrored webcam feed full-screen.
2. Compare current pixels to the previous frame in the bottom detection zone.
3. For each of 16 horizontal key zones, count "moving" pixels.
4. If motion exceeds a threshold (and cooldown elapsed), play the zone's note.
5. Save the current frame as `prevFrame` for the next comparison.

There is no ML or pose detection — it's pure frame differencing on a fixed floor strip.

## Key data structures

### `settings` (tweakable at runtime)

All detection and overlay parameters live in one object. Dev mode sliders write to this object; `draw()` reads from it every frame.

```javascript
const settings = {
  threshold: 8,        // per-pixel RGB change gate
  motionTrigger: 75,   // moving pixels needed to fire
  cooldown: 250,       // ms between triggers per key
  keyZoneHeight: 0.15,
  keyZonePosition: 1,  // 0 = top, 1 = bottom
  // ... overlay + performance knobs
}
```

### `keys` (one per zone)

Built once in `setup()`. Each key stores layout and state:

| Field | Meaning |
|-------|---------|
| `note` | Tone.js note name, e.g. `"C4"` |
| `x`, `w` | Horizontal position and width as fractions (0–1) of frame width |
| `last` | Timestamp (`millis()`) of last trigger — used for cooldown |
| `motion` | Latest frame's moving-pixel count (updated each draw, shown in dev mode) |

### `video` and `prevFrame`

- `video` — live webcam capture at 320×240 (processing resolution; displayed scaled to window).
- `prevFrame` — copy of last frame's pixels. After each `draw()`, `prevFrame.copy(video, ...)` keeps them in sync.

Motion is detected by diffing these two buffers.

## Motion detection (the core loop)

For each key zone, the code defines a rectangle in **camera pixel space**:

```
x1 = key.x * videoWidth
x2 = (key.x + key.w) * videoWidth
top = (1 - keyZoneHeight) * keyZonePosition
y1 = videoHeight * top
y2 = videoHeight * (top + keyZoneHeight)
```

It loops over that rectangle, stepping by `pixelStep` (default: every 2nd pixel) for speed.

For each sampled pixel:

```javascript
diff = |R_now - R_prev| + |G_now - G_prev| + |B_now - B_prev|

if (diff > settings.threshold) {
  motion++
}
```

`diff` is the sum of absolute RGB channel differences — a simple, fast motion metric. Values typically range from 0 (static) to 765 (white ↔ black flip).

A key **triggers** when:

```javascript
motion > settings.motionTrigger && (now - key.last) > settings.cooldown
```

Then it calls `synth.triggerAttackRelease(key.note, settings.noteDuration)` and records `key.last = now`.

## Coordinate spaces

There are two coordinate systems to keep straight:

| Space | Used for |
|-------|----------|
| **Camera pixels** (320×240) | Motion scanning — `video.pixels`, zone bounds |
| **Canvas pixels** (window size) | Drawing overlays — key bars, labels, dev HUD |

The camera feed is drawn scaled to the canvas, but motion math always uses the native 320×240 buffer so detection is consistent regardless of window size.

The canvas is **mirrored** (`scale(-1, 1)`) so it feels like a mirror. Detection still uses the un-mirrored pixel buffer — zones map left-to-right in camera space, which appears reversed on screen. The `notes` array order accounts for this layout.

## Sound

`Tone.PolySynth` wraps multiple `Tone.Synth` voices so overlapping notes (stepping on two keys) work. Audio only starts after the user clicks **START**, which calls `Tone.start()` — a browser requirement.

The envelope (`attack`, `decay`, `sustain`, `release`) shapes each note. These are fixed in `setup()` today; they could be added to dev mode later if needed.

## Dev mode additions

When `devMode` is true:

1. **Key zone outline** — yellow rectangle around the bottom strip (same area as key bars).
2. **Per-key motion counts** — the exact number compared against `motionTrigger`.
3. **Orange "warm" state** — motion > 50% of trigger (almost firing).
4. **HUD** — current threshold, trigger, cooldown, zone height.
5. **Side panel** — sliders bound to `settings`; copy/reset buttons.

The panel does not persist settings automatically. Use **Copy settings JSON** and paste into `sketch.js` to save your calibration.

## Frame lifecycle (one `draw()` call)

```
draw()
  ├─ loadPixels() on video + prevFrame
  ├─ for each key:
  │    ├─ scan zone → count motion
  │    ├─ maybe trigger note
  │    └─ draw overlay bar + label (+ motion count if dev)
  ├─ draw dev HUD if enabled
  └─ prevFrame.copy(video)   ← must happen AFTER comparison
```

If `prevFrame.copy()` ran before scanning, every pixel would diff against itself and motion would always be zero.

## Performance notes

- Scanning every pixel in 16 zones at 60 fps is expensive. `pixelStep: 2` samples ~¼ of pixels.
- Increasing `pixelStep` reduces work but also reduces max `motion` counts — you may need a lower `motionTrigger`.
- Camera resolution is fixed at 320×240 to keep pixel loops predictable.

## Common extension points

- **Different scales** — change `notes` array.
- **Fewer/more keys** — change `NUM_KEYS` and `notes.length`.
- **Velocity sensitivity** — scale note volume by `motion / motionTrigger`.
- **Pose detection** — replace frame diff with MediaPipe / TensorFlow.js foot landmarks for more robust tracking.
