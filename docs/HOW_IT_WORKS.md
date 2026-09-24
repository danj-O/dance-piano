# How Dance Keys works

## Startup and shutdown

The **Start camera and sound** click creates or resumes an `AudioContext`, then calls `getUserMedia`. The front (`user`) camera is preferred by default; Settings can select the rear (`environment`) camera. **Preview sound** can create the same audio context before camera access. The app waits one second for the camera to settle, captures an empty-floor reference frame, and only then shows the playing view. Keep the strip clear during that capture. No notes are generated from the reference frame. Switching cameras cancels frame processing, stops the old track, requests the selected facing mode, and captures a new reference without restarting audio. If switching fails, it tries to restore the previous camera. **Stop camera** stops every media track, detaches the video, cancels frame processing, and closes the audio context. A disconnected camera returns to the start screen with a status message.

All processing happens in the browser. `src/app.js` holds the browser lifecycle and drawing code. `src/layout.js` creates the built-in keyboard module and its zones. `src/detector.js` measures those zones and tracks their state without knowing musical notes. `src/actions.js` sends trigger events to `src/audio.js`, which creates short synthesized notes with Web Audio.

## Video and coordinates

Each new camera frame is drawn into a 320 × 240 offscreen canvas for analysis. `requestVideoFrameCallback` processes actual video frames when the browser supports it; a 50 ms timer is the fallback. The visible canvas preserves the camera aspect ratio, centers it, and mirrors it. The keyboard module derives normalized strip geometry from `zoneHeight` and `zonePosition`; its generated zones supply both the visible key positions and detection bounds.

The strip can be as thin as 0.5% of the frame. Detection bounds always include at least one camera row; at this minimum, only about one or two rows are usually sampled. The overlay moves labels outside strips too thin to contain them. Very thin strips trade foot coverage for precise placement.

The sixteen analysis zones run left to right in **camera** coordinates. The mirror reverses them on screen. `src/music.js` builds the selected scale from low to high, and `src/layout.js` reverses that sequence once when generating camera-order note actions. Changing the key, mode, or octave regenerates the zone labels and future note actions immediately without resetting a held key.

## Occupancy and note triggering

For sampled pixels in each key zone, frame analysis sums absolute RGB differences between the current frame and the empty-floor reference. A pixel counts as different when that sum exceeds `pixelThreshold`. Each key receives a ratio of different pixels to sampled pixels. Ratios make `pressThreshold` comparable across sampling steps and strip heights. A foot that stops moving remains different from the floor and therefore remains occupied.

`ZoneTracker` has an armed state for each zone ID. It emits a trigger when a zone's occupied ratio crosses `pressThreshold`, the cooldown has elapsed, and fewer than half of all zones cross the threshold at once. Broad changes are suppressed because they are often camera shake or a lighting change. Two processed frames below 35% of the press threshold rearm the zone and emit a release event. The release does not play a note. `src/actions.js` maps triggers to the generated note actions; the cooldown is an additional guard against quick retriggers.

The floor reference slowly follows brightness changes only in zones that look empty. Occupied zones are never folded into the reference, even when the foot stays still. A large lighting shift or moved camera can still invalidate the reference; recalibrate with the strip empty in that case.

## Sound

`src/audio.js` uses several oscillator and envelope recipes for Soft keys, Bell, Pluck, Bright synth, and Organ. Notes can overlap, and oscillators disconnect after playback. A compressor protects the output from loud chords. The audio context is created after a Start or Preview click, which satisfies browser audio activation rules.

The dry signal is always present. Reverb sends notes through a generated convolution impulse. Delay uses a feedback loop with a low-pass filter; the feedback gain is fixed below one to prevent runaway repeats. Reverb and delay amount control their send levels independently. The UI sliders cover 0–200%, and adjacent number fields accept higher nonnegative percentages. `normalizeMusicSettings` keeps finite nonnegative amounts without a maximum; `effectSendGain` maps those amounts to a smoothly tapering wet send with an upper bound of 2. Delay time is `60 / BPM` seconds for quarter notes, half that for eighth notes, or three quarters of a beat for dotted eighth notes. Tap tempo keeps recent taps and uses the median interval; pauses reset the sequence.

## Settings and calibration

`DEFAULT_SETTINGS` and valid ranges are defined in `src/detector.js`. The panel reads those values and saves changes in `localStorage` under `dance-keys-settings-v2`. Invalid or older saved values are clamped or replaced with defaults. Calibration first captures a fresh empty-floor frame, then collects the maximum key occupancy ratio for each frame over two seconds. A timer ends calibration independently of whether Settings is open or frames continue arriving. The progress bar is visible only during calibration. Per-key percentages appear during calibration or whenever **Show key percentages** is enabled; that preference also saves locally. Green fill takes priority for a brief note-trigger flash, then yellow fill shows that the key remains occupied. The 90th percentile plus a margin sets `pressThreshold`; calibration does not change pixel sensitivity or trigger notes while it runs.

`src/music.js` defines defaults and validates saved musical choices under `dance-keys-music-v1`. The default C major mapping matches the original sixteen notes. Changes to sound and effects update the running audio graph; changes to key or mode rebuild the note labels. Reset defaults restores both detection and music settings.

Run `npm test` to check frame assignment, normalized ratios, entry/hold/exit behavior, background adaptation, scale mapping, tap tempo, delay timing, and settings validation.
