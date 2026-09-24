# Dance Keys

A small browser floor piano. Point a camera at the floor, step into one of sixteen key zones, and play notes. Video is processed locally in the browser; there is no server upload, build step, or external JavaScript dependency.

## Run it

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a recent Chrome, Firefox, or Safari. Aim the camera at a clear floor and keep the key strip empty while clicking **Start camera and sound**. After a one-second reference capture, step into the strip. The view is mirrored like a mirror; notes go from low on the left to high on the right. Use **Stop camera** to release the camera and audio. Camera access requires localhost or HTTPS when hosted elsewhere.

For a phone, host the folder on HTTPS and open that URL on the phone. A plain LAN `http://` URL usually cannot request a camera. The front camera is selected by default so you can face the screen. Open **Settings → Camera** to choose the rear camera before starting or switch while playing. Switching releases the previous camera and captures a new empty-floor reference; keep the key strip clear until it finishes. The choice saves in this browser.

## Tune it

Open **Settings** or press **D**. The outline shows the detection area. Move out of the strip and press the large **Calibrate empty floor** button at the top of Settings. A progress bar and per-key percentages appear during the short capture. Percentages disappear when it finishes unless **Show key percentages** is on. A key turns green briefly when it plays, then yellow while it remains occupied. Calibration captures a fresh floor reference and sets a starting step threshold for the current lighting. Then test a few steps and adjust the sliders if needed. Settings and the display switch save automatically in this browser; **Reset defaults** restores the shipped values.

**Key strip height** can go down to 0.5% of the frame, visually almost a line. At that size the detector sees only about one or two camera rows, so use steady camera placement and consider a pixel sample step of 1 if hits are missed.

## Make it yours

In **Settings → Music**, choose a key, starting octave, and scale or mode. The sixteen notes update immediately, low to high across the mirrored screen. Choose one of five synthesized sounds; **Preview sound** plays a middle key even before starting the camera.

In **Settings → Effects**, turn on reverb or delay and adjust each amount. The sliders reach 200%; type a higher nonnegative percentage in the adjacent field if needed. High amounts taper smoothly in the audio engine to keep the wet signal controlled. Delay follows the chosen BPM and note spacing. Set BPM with the slider or tap **Tap tempo** at least twice at a steady pace. Music and effects settings save in this browser. **Reset defaults** restores C major, octave 3, Soft keys, 120 BPM, and both effects off.

See [docs/TUNING.md](docs/TUNING.md) for a practical guide and [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for the detection and audio design.

## Development

```sh
npm test
```

The test command uses Node's built-in test runner; no install is needed. The app itself is plain HTML, CSS, and JavaScript modules.

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Accessible controls and responsive layout |
| `src/app.js` | Camera lifecycle, rendering, settings, calibration |
| `src/detector.js` | Frame analysis and note trigger state machine |
| `src/music.js` | Scale mapping, music settings, delay timing, tap tempo |
| `src/audio.js` | Web Audio synth, reverb, and delay |
| `test/` | Detection and music tests |

## Current limits

Detection measures what differs from a clear-floor image; it does not recognize feet. Shadows, a moving camera, or another object in the key strip can still play notes. If the camera moves or the lighting changes substantially, clear the strip and recalibrate. Camera and audio behavior should be checked on the actual device and floor where it will be used.
