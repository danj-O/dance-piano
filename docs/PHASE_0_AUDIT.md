# Phase 0 — Repository Audit and Architecture Reconciliation

Audited 2026-09-24. This report records the current implementation; it does not implement the target architecture in `ARCHITECTURE.md`, `DETECTION.md`, `CUSTOMIZATION.md`, or `ROADMAP.md`.

## Current runtime flow and ownership

```text
Camera stream → video element → 320 × 240 canvas frame
  → compare against one background frame in sixteen fixed strip slices
  → sixteen changed-pixel ratios → KeyTracker returns triggered key indices
  → app maps camera-order indices to notes → DanceAudio.play(note)
```

| File | Current responsibility |
| --- | --- |
| `index.html`, `styles.css` | Canvas, start/stop/settings controls, camera choice, calibration UI, music/effects/detection controls, responsive styling. |
| `src/app.js` | Browser lifecycle, camera acquisition and switching, frame scheduling, calibration session, canvas overlay, settings and `localStorage`, key-index-to-note mapping, audio calls. |
| `src/detector.js` | Detection setting defaults and validation, fixed strip geometry, per-key changed-pixel ratios, per-key background update, key trigger/rearm state machine, calibration threshold calculation. |
| `src/music.js` | Tonic/mode note sequences, music setting validation, tempo and delay calculations. |
| `src/audio.js` | Web Audio synth and effects graph, sound presets, note playback, audio context lifetime. |
| `test/` | Pure detector and music tests; no browser/camera integration harness. |

`src/app.js` creates or resumes audio before requesting the camera. `openCamera` requests a preferred front or rear camera, creates a muted inline video element, waits for playback, and starts the frame loop. `requestVideoFrameCallback` drives the loop when available; a 50 ms timer is the fallback. A `runId` invalidates callbacks and late camera acquisitions after stop or switch. Startup and a successful camera switch wait one second, then snapshot a reference frame. Switching stops the old tracks and keeps the audio context; stopping releases camera and audio. The video is drawn into a centered, mirrored visible canvas, while analysis uses the unmirrored 320 × 240 frame.

## Geometry and detection

`KEY_COUNT` is 16. A key is an implicit equal-width vertical slice of a single full-width horizontal strip. There are no persisted zone objects or per-key geometry records. `zoneHeight` is a normalized frame-height fraction. The strip's normalized top is `(1 - zoneHeight) × zonePosition`; the latter is a position within the available vertical travel, not an absolute top-left coordinate. `zoneBounds` converts this to integer rows and guarantees at least one row. The app separately mirrors the strip on screen and reverses the note array, so camera key 0 maps to the rightmost visible key.

The baseline is one full-frame `Float32Array` copied from a 320 × 240 RGBA image. `analyzeOccupancy` samples each key slice every `pixelStep` pixels. For each sample it sums the absolute RGB differences from the baseline; a sample is changed only when that sum is strictly greater than `pixelThreshold`. The output ratio is `changed / sampled`, from 0 to 1. Alpha is ignored. The default strip (`zoneHeight = 0.005`, `zonePosition = 0.94`, `pixelStep = 2`) spans row 224 only and samples ten pixels per key at 320 × 240. Its ratio therefore changes in 10-point increments. This quantization matters when evaluating thresholds and future drift detection.

After normal trigger processing, `adaptBackground` updates RGB baseline pixels in each key slice whose ratio is below `0.35 × pressThreshold`. Every pixel in an eligible slice moves 2% toward the current frame on **each processed frame**, including pixels that individually differed. The update uses neither elapsed time nor a stability history. It freezes slices at or above that low cutoff, including slices with moderate activity below the trigger threshold. The full-frame array is shared, but the current sixteen nonoverlapping slices are gated separately; pixels outside the strip are not updated during normal play.

## Calibration and trigger state

There are three reference captures: startup and camera switching each take one snapshot after a one-second settling period; pressing **Calibrate empty floor** discards the current baseline, waits 500 ms, and captures another snapshot. Only the manual path estimates a threshold. During its 2.5-second timer, the app records the **maximum of sixteen ratios per processed frame**, suppresses note tracking, and skips background adaptation. `calibrationThreshold` takes the 90th-percentile sample (by sorted index), calculates `ceil((sample × 2.5 + 0.05) × 100) / 100`, and clamps the result to 0.08–0.60. This becomes one global `pressThreshold`; one noisy key can therefore raise sensitivity requirements for all keys. The threshold is the only calibration result persisted. The frame baseline, ratios, and sample history remain in memory and are recreated on reload. The button/timer, not closing Settings, ends calibration. A camera switch or stop cancels it.

`KeyTracker` maintains `{ armed, quietFrames, lastNote }` for each of sixteen keys. An armed key reaching `pressThreshold` becomes unarmed immediately. It emits its index only if fewer than eight keys are currently above threshold and that key's last emitted note is at least `cooldownMs` old. Thus broad-change and cooldown suppression still disarm the key. An unarmed key rearms after two **processed frames** below `0.35 × pressThreshold`; leaving does not emit a note or explicit release event. The two-frame release interval depends on camera frame rate. The tracker is reset after a new reference capture, successful manual calibration, relevant geometry/sampling changes, reset defaults, and camera release.

## Music, audio, UI, and persistence

`buildNotes` creates sixteen scale notes from tonic, mode, and octave. `src/app.js` reverses them for the mirrored display, uses `notes[key]` when the detector returns an index, and calls `DanceAudio.play(note)`. `DanceAudio` turns note names into oscillator frequencies and envelopes, mixes the dry signal with optional convolution reverb and tempo-synced feedback delay, and routes through a compressor. No note or sound logic is imported by `src/detector.js`; the app currently performs that translation inline.

`index.html` exposes camera, detection, display, music, and effects controls. `src/app.js` binds them, draws the camera/key overlay, shows calibration progress and status, and updates the live audio graph. Settings are stored separately in browser `localStorage`:

| Key | Stored data | Loading behavior |
| --- | --- | --- |
| `dance-keys-settings-v2` | Detection settings, including the globally calibrated `pressThreshold` | JSON parsed and bounded by `normalizeSettings`; invalid/missing values use defaults. |
| `dance-keys-music-v1` | Key, mode, octave, sound, reverb/delay choices, tempo | JSON parsed and validated by `normalizeMusicSettings`. |
| `dance-keys-show-percentages` | Boolean display preference as text | Only `"true"` enables it. |
| `dance-keys-camera-v1` | `user` or `environment` | Defaults to front; only `environment` selects rear. |

No layout, module, zone, per-key threshold, runtime baseline, or event history is persisted. **Reset defaults** restores detection/music/display settings and selects the front camera; it does not introduce a new persistence format.

## Piano-specific coupling and observability

The detector itself hardcodes sixteen keys in `KEY_COUNT`, array validation, equal-width slice loops, and the “half the keys” broad-change rule. `KeyTracker` exposes key indices rather than semantic trigger/release events. `src/app.js` repeats the sixteen-key geometry in drawing and reverses indices for mirrored note labels. Global calibration takes the maximum across those sixteen ratios. These are the principal seams Phase 1 must address before multiple or overlapping modules are possible.

Current debugging consists of optional live per-key percentages (always shown during manual calibration), colored idle/occupied/recent-note states, a calibration progress bar, and text status. There is no raw pixel-difference display, ratio history, per-zone state/adaptation indicator, frame timing, or structured log. Existing tests verify strip bounds, key assignment and normalized ratios, entry/hold/exit behavior, broad suppression and cooldown, a simple low-level background update, calibration-threshold calculation, settings validation, scale mapping, and delay timing. `npm test` runs twelve Node tests. There is no test of browser lifecycle, media permission/facing-mode behavior, calibration timer and capture sequencing, persistence in a browser, audio output, real camera noise, or the one-row default strip under representative conditions. No separate lint/build/CI check was found in the repository.

## Adaptive-calibration feasibility, risks, and unknowns

The existing floating-point frame baseline and slice-gated update are usable foundations for gradual adaptation. They do **not** yet establish drift classification. At the default threshold (`pressThreshold = 0.16`), the update cutoff is 0.056, below one 0.10 ratio step in the default strip. One changed sample freezes adaptation in that key, while a changed pixel that does not cross `pixelThreshold` is silently assimilated. At taller strips or different sample steps, the ratio has finer resolution. A fixed 2% update per frame also changes behavior with device frame rate.

Independent zone adaptation needs per-zone runtime measurements, temporal stability/idle history, occupancy and recent-trigger/release state, and an adaptation eligibility decision. The baseline pixels can remain in shared storage for disjoint zones, but future overlaps make independent updates ambiguous: an idle zone could learn pixels occupied in another zone. The design must choose separate zone baselines or a shared-pixel policy that freezes updates whenever any overlapping zone is plausibly occupied.

A stable ratio alone cannot distinguish environmental drift from a stationary person, prop, or shadow. Trends, magnitude, spatial extent, scene-wide exposure movement, and a guarded time history may support a conservative distinction, but cannot guarantee it. Current startup/manual/switch captures can learn a person already in the strip. Current low-activity updates can learn a small persistent object; moderate persistent drift cannot recover because it is above the eligibility cutoff. A broad lighting change may suppress notes yet leave the baseline frozen. Any automatic refresh based only on “no triggers” or on stability after an object has arrived can likewise absorb that object.

Global-idle auto-calibration and local per-zone adaptation should share measurement and baseline-update primitives, but have **distinct eligibility policies**. A stronger global refresh needs evidence that the whole scene is both unused and suitably stable, and should not be inferred merely from no emitted notes. Per-zone adaptation should be slow and independently guarded; both need a post-interaction grace period. Real-device recordings across lighting changes, shadows, exposure shifts, thin strips, occupied feet, and camera movement are needed before selecting thresholds/times.

## Recommended Phase 1 boundaries and architecture reconciliation

Phase 1 should introduce a versioned default layout and a keyboard module that deterministically generates sixteen zone definitions. It should carry the existing `zoneHeight`/`zonePosition` mapping and camera-coordinate/mirror behavior through an adapter so old saved settings and familiar play remain intact. Make frame measurement consume zone geometry instead of generating fixed key slices internally; make zone state emit trigger/release transitions rather than only indices; route triggers through explicit note actions to the current `DanceAudio`. Keep the current shared baseline, manual calibration algorithm, audio graph, settings UI, and broad-change behavior equivalent for the default layout. Add parity tests for geometry, screen ordering, triggered notes, release/rearm, and existing persistence before changing calibration heuristics.

Before Phase 1, clarify the target runtime diagram: **layout/module configuration generates zones; zone geometry feeds detection; detection measurements feed each zone's state machine; events feed actions and outputs**. The current diagram places “Zone Detection” after frame analysis and can read as if zones arise after detection. Treat independent *adaptation decisions* as a zone requirement, but leave baseline storage (shared frame versus per-zone buffers) open until overlapping-zone and Phase 2 behavior is designed. The conceptual keyboard transform (`y = 0.75`, `height = 0.25`) is illustrative, not today's default (`y ≈ 0.9353`, `height = 0.005`); Phase 1 must derive its default from current settings rather than copy the example. The half-of-all-zones broad-change rule and max-across-zones calibration will need reconsideration for mixed-size/multiple modules, but this should not be an unrequested Phase 1 behavior change.

Do not implement Customize Mode, generic trigger modules, new audio actions, or adaptive-calibration heuristics in Phase 1. Those remain later phases of the roadmap.
