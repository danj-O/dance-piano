# How Dance Keys works

## Startup and shutdown

The **Start camera and sound** click creates and resumes an `AudioContext`, then calls `getUserMedia`. The app waits for a camera frame, copies it as the reference frame, and only then shows the playing view. No notes are generated from the initial blank frame. **Stop camera** stops every media track, detaches the video, cancels frame processing, and closes the audio context. A disconnected camera returns to the start screen with a status message.

All processing happens in the browser. `src/app.js` holds the browser lifecycle and drawing code. `src/detector.js` contains functions that can run without a camera or browser. `src/audio.js` creates short synthesized notes with Web Audio.

## Video and coordinates

Each new camera frame is drawn into a 320 × 240 offscreen canvas for analysis. `requestVideoFrameCallback` processes actual video frames when the browser supports it; a 50 ms timer is the fallback. The visible canvas preserves the camera aspect ratio, centers it, and mirrors it. Both the visible key strip and the detection bounds use the same `zoneHeight` and `zonePosition` settings.

The sixteen analysis zones run left to right in **camera** coordinates. The mirror reverses them on screen. The note array in `src/app.js` therefore runs high to low in camera order, producing low to high notes on screen.

## Motion and note triggering

For sampled pixels in each key zone, frame analysis sums absolute RGB channel changes. A pixel counts as moving when that sum exceeds `pixelThreshold`. Each key receives a ratio of moving pixels to sampled pixels. Ratios make `pressThreshold` comparable across sampling steps and strip heights.

`KeyTracker` has an armed state for each key. A key plays once when its ratio crosses `pressThreshold`, the cooldown has elapsed, and fewer than half of all zones cross the threshold at once. Broad movement is suppressed because it is often camera shake or a lighting change. After a note, two processed frames below 35% of the press threshold rearm that key. The cooldown is an additional guard against quick retriggers.

This is motion detection, so a stationary foot is not tracked as an occupied key. A new movement after rearming may play the same note again. Foot segmentation or background subtraction would be a different detection model.

## Sound

Each note uses a sine oscillator and a short gain envelope. Oscillators disconnect after playback, so overlapping notes can sound together without holding idle voices. The audio context is created only after the Start click, which satisfies browser audio activation rules.

## Settings and calibration

`DEFAULT_SETTINGS` and valid ranges are defined in `src/detector.js`. The panel reads those values and saves changes in `localStorage` under `dance-keys-settings-v2`. Invalid or older saved values are clamped or replaced with defaults. Calibration collects the maximum key motion ratio for each frame over two seconds while the strip is empty. It uses the 90th percentile plus a margin to set `pressThreshold`; it does not change pixel sensitivity. Calibration pauses note triggering while it runs.

Run `npm test` to check frame assignment, normalized ratios, trigger and rearm behavior, broad movement suppression, settings validation, and calibration math.
