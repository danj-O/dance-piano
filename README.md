# Dance Keys (Floor Piano)

A browser-based motion piano: point your webcam at the floor, step on virtual keys, and play notes. Built with [p5.js](https://p5js.org/) for camera + canvas and [Tone.js](https://tonejs.github.io/) for sound.

## Quick start

1. Serve the folder over HTTP (camera access requires it — opening `index.html` directly often fails):

   ```bash
   npx serve .
   # or: python3 -m http.server 8000
   ```

2. Open the URL in Chrome or Firefox.
3. Click **START** (required to unlock audio).
4. Position the camera so your feet appear in the **bottom strip** of the frame.
5. Step on the key zones — each vertical slice plays a note (high notes on the left, low on the right).

## How it works

```
Camera frame (320×240)
┌─────────────────────────────┐
│                             │  ← ignored
│         live video          │
│                             │
├─────────────────────────────┤  ← detection zone (bottom 15% by default)
│ K0 │ K1 │ K2 │ ... │ K15   │  ← 16 vertical key zones
└─────────────────────────────┘
         feet step here
```

Each frame, the app compares the current camera image to the previous one. For every key zone in the bottom strip, it counts pixels whose RGB values changed enough since last frame. If that count exceeds a threshold and the key isn't on cooldown, it plays the assigned note.

See [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for a deeper walkthrough of the code.

## Dev mode (tuning)

Press **D** or click **Dev Mode** in the top-right to open the tuning panel.

| Control | What it does |
|---------|----------------|
| **Pixel threshold** | Sensitivity per pixel — lower catches smaller movement |
| **Motion trigger** | How many "moving" pixels must appear in a zone to fire |
| **Cooldown** | Milliseconds before the same key can re-trigger |
| **Key zone height** | Height of the key strip |
| **Key zone position** | Vertical position (0 = top, 1 = bottom) |

While dev mode is on:

- A **yellow box** outlines the key zone (same area as the key bars).
- Each key shows a **live motion count** — step on a key and note the number when it reliably triggers.
- Keys turn **orange** at ~50% of the trigger threshold (almost there).
- **Copy settings JSON** copies your tuned values — paste them into the `settings` object at the top of `sketch.js` to lock them in.

See [docs/TUNING.md](docs/TUNING.md) for a practical tuning workflow.

## Project files

| File | Purpose |
|------|---------|
| `index.html` | Page shell, start button, dev panel UI |
| `sketch.js` | Camera capture, motion detection, sound, dev mode logic |
| `docs/HOW_IT_WORKS.md` | Code architecture and data flow |
| `docs/TUNING.md` | Step-by-step calibration guide |

## Customization

- **Notes / scale** — edit the `notes` array in `sketch.js` (one entry per key, left to right).
- **Key count** — change `NUM_KEYS` and match the length of `notes`.
- **Sound** — tweak the `Tone.PolySynth` options in `setup()` (wave type, envelope).
- **Defaults** — edit the `settings` object in `sketch.js` after tuning in dev mode.

## Tips

- Good lighting and contrast help motion detection a lot.
- A plain floor works better than busy patterns.
- If keys fire from background movement, raise **motion trigger** or **threshold**.
- If keys don't fire when you step, lower **motion trigger** or **threshold**, or widen **detection zone height**.
