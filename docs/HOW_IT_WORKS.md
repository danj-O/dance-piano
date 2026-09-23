# How Dance Keys works

## Startup and shutdown

The **Start camera and sound** click creates and resumes an `AudioContext`, then calls `getUserMedia`. The app waits one second for the camera to settle, captures an empty-floor reference frame, and only then shows the playing view. Keep the strip clear during that capture. No notes are generated from the reference frame. **Stop camera** stops every media track, detaches the video, cancels frame processing, and closes the audio context. A disconnected camera returns to the start screen with a status message.

All processing happens in the browser. `src/app.js` holds the browser lifecycle and drawing code. `src/detector.js` contains functions that can run without a camera or browser. `src/audio.js` creates short synthesized notes with Web Audio.

## Video and coordinates

Each new camera frame is drawn into a 320 × 240 offscreen canvas for analysis. `requestVideoFrameCallback` processes actual video frames when the browser supports it; a 50 ms timer is the fallback. The visible canvas preserves the camera aspect ratio, centers it, and mirrors it. Both the visible key strip and the detection bounds use the same `zoneHeight` and `zonePosition` settings.

The strip can be as thin as 0.5% of the frame. Detection bounds always include at least one camera row; at this minimum, only about one or two rows are usually sampled. The overlay moves labels outside strips too thin to contain them. Very thin strips trade foot coverage for precise placement.

The sixteen analysis zones run left to right in **camera** coordinates. The mirror reverses them on screen. The note array in `src/app.js` therefore runs high to low in camera order, producing low to high notes on screen.

## Occupancy and note triggering

For sampled pixels in each key zone, frame analysis sums absolute RGB differences between the current frame and the empty-floor reference. A pixel counts as different when that sum exceeds `pixelThreshold`. Each key receives a ratio of different pixels to sampled pixels. Ratios make `pressThreshold` comparable across sampling steps and strip heights. A foot that stops moving remains different from the floor and therefore remains occupied.

`KeyTracker` has an armed state for each key. A key plays once when its occupied ratio crosses `pressThreshold`, the cooldown has elapsed, and fewer than half of all zones cross the threshold at once. Broad changes are suppressed because they are often camera shake or a lighting change. After a note, two processed frames below 35% of the press threshold rearm that key. Leaving the key returns the image toward the floor reference, so it rearms without playing. The cooldown is an additional guard against quick retriggers.

The floor reference slowly follows brightness changes only in zones that look empty. Occupied zones are never folded into the reference, even when the foot stays still. A large lighting shift or moved camera can still invalidate the reference; recalibrate with the strip empty in that case.

## Sound

Each note uses a sine oscillator and a short gain envelope. Oscillators disconnect after playback, so overlapping notes can sound together without holding idle voices. The audio context is created only after the Start click, which satisfies browser audio activation rules.

## Settings and calibration

`DEFAULT_SETTINGS` and valid ranges are defined in `src/detector.js`. The panel reads those values and saves changes in `localStorage` under `dance-keys-settings-v2`. Invalid or older saved values are clamped or replaced with defaults. Calibration first captures a fresh empty-floor frame, then collects the maximum key occupancy ratio for each frame over two seconds. A timer ends calibration independently of whether Settings is open or frames continue arriving. The progress bar is visible only during calibration. Per-key percentages appear during calibration or whenever **Show key percentages** is enabled; that preference also saves locally. Green fill takes priority for a brief note-trigger flash, then yellow fill shows that the key remains occupied. The 90th percentile plus a margin sets `pressThreshold`; calibration does not change pixel sensitivity or trigger notes while it runs.

Run `npm test` to check frame assignment, normalized ratios, entry/hold/exit behavior, background adaptation, broad-change suppression, settings validation, and calibration math.
