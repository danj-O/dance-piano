# Dance Keys

A small browser floor piano. Point a camera at the floor, step into one of sixteen key zones, and play notes. Video is processed locally in the browser; there is no server upload, build step, or external JavaScript dependency.

## Run it

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a recent Chrome, Firefox, or Safari. Click **Start camera and sound**, allow camera access, and place your feet inside the key strip. The view is mirrored like a mirror; notes go from low on the left to high on the right. Use **Stop camera** to release the camera and audio. Camera access requires localhost or HTTPS when hosted elsewhere.

For a phone, host the folder on HTTPS and open that URL on the phone. A plain LAN `http://` URL usually cannot request a camera.

## Tune it

Open **Settings** or press **D**. The outline shows the detection area; each key displays its moving-pixel percentage. Put the strip where your feet land. Move out of the strip and press **Calibrate idle noise** to set a starting step threshold for the current lighting. Then test a few steps and adjust the sliders if needed. Settings save automatically in this browser; **Reset defaults** restores the shipped values.

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
| `src/audio.js` | Web Audio synth |
| `test/detector.test.js` | Detection and settings tests |

## Current limits

Detection uses camera motion, not foot recognition. Fast shadows, a moving camera, or another object moving in the key strip can still play notes. A foot held still eventually rearms the key; a new movement on that key can then play it again. Camera and audio behavior should be checked on the actual device and floor where it will be used.
