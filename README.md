# Dance Keys

A small browser floor piano. Point a camera at the floor, step into one of sixteen key zones, and play notes. Video is processed locally in the browser; there is no server upload, build step, or external JavaScript dependency.

## Run it

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a recent Chrome, Firefox, or Safari. Aim the camera at a clear floor and keep the key strip empty while clicking **Start camera and sound**. After a one-second reference capture, step into the strip. The view is mirrored like a mirror; notes go from low on the left to high on the right. The performance toolbar then shows **Stop camera**, **Calibrate**, and **Mute**. Stop releases the camera and audio. Calibrate refreshes the empty-floor reference using the same capture as Settings; step out of the strip until the button says **Calibrated**. Mute silences the full audio output, including effect tails, without stopping the camera or held notes. Tap **Unmute** to hear them again. Mute lasts for the current page session. Camera access requires localhost or HTTPS when hosted elsewhere.

For a phone, host the folder on HTTPS and open that URL on the phone. A plain LAN `http://` URL usually cannot request a camera. The front camera is selected by default so you can face the screen. Open **Settings → Camera & Display** to choose the rear camera before starting or switch while playing. Switching releases the previous camera and captures a new empty-floor reference; keep the key strip clear until it finishes. The choice saves in this browser.

## Tune it

Open **Settings** or press **D**. The outline shows the detection area. **Settings → Detection** has the same empty-floor calibration action as the performance toolbar, plus sensitivity controls. The progress bar appears during capture and stops when the new reference is ready. Calibration keeps the selected Step sensitivity unchanged. **Settings → Camera & Display → Show key percentages** controls live occupancy numbers. A key turns green briefly when it plays, then yellow while it remains occupied. Settings save automatically in this browser; **Reset all settings to defaults** on the Settings root restores the shipped values.

**Key strip height** can go down to 0.5% of the frame, visually almost a line. At that size the detector sees only about one or two camera rows, so use steady camera placement and consider a pixel sample step of 1 if hits are missed.

## Make it yours

In **Settings → Instrument**, choose a key, starting octave, and scale or mode. The sixteen notes update immediately, low to high across the mirrored screen. Choose one of five synthesized sounds; **Preview sound** plays a middle key even before starting the camera. One-shot is the default note behavior; Gate sustains a note until the key releases. Attack, Decay, Sustain level, and Release shape newly played notes.

In **Settings → Effects**, turn on reverb or delay and adjust each amount. The sliders reach 200%; type a higher nonnegative percentage in the adjacent field if needed. High amounts taper smoothly in the audio engine to keep the wet signal controlled. Delay follows the chosen BPM and note spacing. Set BPM with the slider or tap **Tap tempo** at least twice at a steady pace. Music and effects settings save in this browser. Resetting defaults restores C major, octave 3, Soft keys, 120 BPM, and both effects off.

See [docs/TUNING.md](docs/TUNING.md) for a practical guide and [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for the detection and audio design.

## Development

```sh
npm test
```

The test command uses Node's built-in test runner; no install is needed. The app itself is plain HTML, CSS, and JavaScript modules.

To exercise the Phase 5 mixed layout, open <http://localhost:8000/index.html?layout=percussion-demo>. It adds a **KICK** region on the performer's left and **SNARE** on the right, above the unchanged keyboard. The query parameter is for development only and saves nothing; remove it to return to the classic piano. Keep all three playable areas clear during reference capture. See [docs/PHASE_5_RESULTS.md](docs/PHASE_5_RESULTS.md) for the test procedure and current limits.

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Accessible controls and responsive layout |
| `src/app.js` | Camera lifecycle, rendering, settings, calibration |
| `src/detector.js` | Frame analysis and generic zone trigger state machine |
| `src/music.js` | Scale mapping, music settings, delay timing, tap tempo |
| `src/audio.js` | Web Audio synth, percussion, reverb, and delay |
| `test/` | Detection and music tests |

## Current limits

Detection measures what differs from a clear-floor image; it does not recognize feet. Shadows, a moving camera, or another object in the key strip can still play notes. If the camera moves or the lighting changes substantially, clear the strip and recalibrate. Camera and audio behavior should be checked on the actual device and floor where it will be used.
