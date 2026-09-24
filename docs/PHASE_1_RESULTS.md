# Phase 1 Results — Module Foundation

## Summary

The built-in Dance Piano now runs through a versioned in-memory layout, a keyboard module, generated zones, ID-based zone events, and note actions. The visible default remains a sixteen-key floor piano. Phase 2 customization and adaptive calibration were not implemented.

## Files changed

- `src/layout.js`: default layout and deterministic keyboard zone generation.
- `src/detector.js`: geometry-driven measurement and background update; ID-based `ZoneTracker` events.
- `src/actions.js`: trigger-to-note dispatch boundary.
- `src/app.js`: connects layout, generated zones, detector, tracker, actions, drawing, and existing camera/calibration/UI lifecycle.
- `index.html`: refreshes the app module URL for browser caches.
- `test/detector.test.js`, `test/layout.test.js`: parity and boundary tests.
- `docs/ARCHITECTURE.md`, `docs/DETECTION.md`, `docs/HOW_IT_WORKS.md`, this report: current implementation documentation.

The preexisting Phase 0 documentation is retained as a historical audit.

## Resulting runtime flow

```text
Existing saved settings + music choices
  → versioned default layout → keyboard module → generated zones
Camera frame + shared baseline + zone geometry
  → per-zone changed-pixel ratios → ZoneTracker trigger/release events
  → note actions → DanceAudio.play(note)
```

`src/app.js` still owns the camera, frame loop, calibration session, settings panel, and storage. The detector has no music or audio dependency.

## Data model

The default layout is `{version: 1, id, name, modules}` and exists only in memory. Its keyboard module has a stable ID, normalized `transform`, and `config` containing key count, tonic, mode, and octave. `generateZones` produces ordered runtime zones with stable IDs, `moduleId`, normalized camera-space `geometry`, and `{type: 'note', note}` actions. Zones, events, and tracker state are not persisted. The default count is sixteen; a different count is supported internally but not exposed in the interface.

## Compatibility decisions and parity evidence

- `zoneHeight` still means a fraction of frame height. The module's top is `(1 - zoneHeight) × zonePosition`, preserving the existing saved position meaning. Tests check default integer frame rows and all sixteen equal-width columns at 320 × 240.
- Analysis remains in unmirrored camera order. Generated note actions reverse the existing low-to-high scale once, while drawing mirrors zone positions. Tests check visible low-to-high note order and the action sent by a camera-side zone.
- The same RGB delta test, pixel sampling, changed/sample ratio, full-frame `Float32Array` reference, and 2% per-frame low-activity region update remain in place. Tests check ratios, sampling, held-foot protection, and gradual baseline update.
- The tracker preserves press threshold, the lower 35% release threshold, two processed quiet frames, cooldown, and half-of-zones broad-change suppression. A release event marks the existing rearm point and does not stop or start a note. Tests cover trigger, hold, release, re-entry, cooldown, and broad change.
- Startup, camera switch, and manual calibration still capture one shared reference. Manual calibration still uses the maximum generated-zone reading per frame and the unchanged global threshold calculation. Calibration remains disabled from triggering/adapting while samples are collected.
- The existing `dance-keys-settings-v2`, `dance-keys-music-v1`, `dance-keys-show-percentages`, and `dance-keys-camera-v1` localStorage keys and stored values were not migrated. Settings normalization is tested.
- Sound generation, effects, camera controls, settings controls, and their UI were not redesigned.

## Checks performed

- `npm test`: 16 tests passed.
- `node --check src/app.js`: passed.
- `git diff --check`: passed.
- Local browser smoke check: page loaded, Settings opened, all expected controls appeared, and no console errors were reported.

Live camera interaction on a physical device was not exercised in this environment, so visual alignment and camera-specific timing should still be checked on desktop and mobile.

## Known limitations and deferred technical debt

- Layouts are neither user-editable nor persisted; only the built-in keyboard module is supported.
- The detector has one shared full-frame baseline and one global threshold. There is no idle auto-calibration, per-zone drift history, or post-trigger adaptation grace period.
- Broad-change suppression treats half of **all supplied zones** as a global camera change. This is equivalent for the built-in keyboard but will need a policy decision before Phase 3 mixes module types.
- Background adaptation assumes zones do not overlap. Overlap would allow multiple updates of the same baseline pixel in one frame.
- The renderer still has a strip outline and key-label presentation specialized for the one default keyboard. A future customization interface needs module-aware drawing without changing Phase 1 detection or action boundaries.

## Considerations for Phase 2

Adaptive calibration can build on the ID-based zone state and shared baseline, but should track stability and recent occupancy independently per zone. A global idle reference refresh should have separate eligibility rules from low-level local adaptation. Any independent adaptation must guard against learning a still-occupied zone as background. Preserve the existing manual fallback and validate timing against real camera behavior before changing thresholds.
