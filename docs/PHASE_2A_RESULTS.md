# Phase 2A Results — Detection Telemetry and Temporal Zone State

## Summary and files changed

This phase adds observational time history to each runtime zone and an opt-in detector telemetry panel. It does not implement self-calibration.

- `src/telemetry.js`: bounded per-zone observation history and snapshot statistics.
- `src/detector.js`: `ZoneTracker` records telemetry alongside its unchanged trigger/release decisions and exposes `snapshot(zoneId, now)`.
- `src/app.js`, `index.html`, `styles.css`: temporary debug toggle and live per-zone panel; module URL cache refresh.
- `test/telemetry.test.js`: deterministic temporal tests.
- `docs/ARCHITECTURE.md`, `docs/DETECTION.md`, this report: current-state documentation.

## Temporal state model

Each zone records its latest raw ratio, latest frame-to-frame ratio delta, whether the existing tracker is armed or disarmed, last emitted trigger/release times, and the start of its current inactive interval. Durations are computed from elapsed monotonic time supplied to `ZoneTracker.update` and `snapshot`, rather than from frame counts. Inactive means **armed and below the existing press threshold**; it includes a persistent 10% reading if the threshold is 20%. A suppressed threshold crossing still disarms the zone under the existing rules, so the debug panel may show `ACTIVE` without a recent emitted trigger.

An observational `adaptationState` is `blocked-active` for disarmed zones and `unassessed` otherwise. It deliberately makes no stable-drift or adaptation-eligibility judgment. Neither label changes baseline updates.

## History and stability metrics

The tracker samples activity at most once per 100 ms, keeps only the latest 10 seconds, and enforces a 120-sample cap per zone. This gives roughly 100 points over several seconds while avoiding unbounded storage or a per-frame history allocation. The current raw ratio and latest delta still update on every processed frame. Snapshots provide mean, minimum, maximum, range, standard deviation, and largest increase between retained samples. Range and deviation distinguish repeated 10% activity from 0/10% flicker; largest rise and the latest delta reveal a jump toward interaction. These describe the signal and do not classify its cause.

At the default strip height, a key samples about ten pixels, so one changed sample moves the reported ratio by approximately ten percentage points. A single-sample change therefore creates a conspicuous range even if the scene is otherwise quiet. A truly brief jump can be missed by the 100 ms history sampling, though the latest per-frame delta records it at the time; sustained jumps remain visible in history. No sampling resolution was changed.

## Debug view

Settings now has **Show detector telemetry**, off by default and not saved. The panel lists each camera-order zone ID, raw percentage, armed/active state, recent range, continuous idle duration, time since trigger and release, and a compact recent-history trace. Hovering a row exposes mean, standard deviation, and largest sampled rise. The panel refreshes at most four times per second and can be closed directly. During manual calibration it labels the state `CAL`; the current measured percentage is shown, while tracker history is paused as before. The normal key percentages setting and main playing view retain their behavior.

## Verification and behavior boundary

`npm test` passes 21 tests, including bounded history, timestamp and idle timing, 10% steady versus 0/10% flickering activity, a rapid rise, tracker reset, and all Phase 1 measurement/trigger/background/calibration tests. Syntax and diff checks pass. The existing `measureZones`, `adaptBackground`, `calibrationThreshold`, camera reference capture, music, action dispatch, and localStorage formats were not changed. The tracker still uses the same threshold, two-frame rearm, cooldown, and broad-change logic. Telemetry is not used by the background update.

A local browser smoke check confirmed that the app loads, Settings opens, the telemetry toggle reveals all sixteen zone rows, and no console errors appear. Live camera behavior still needs the real-device experiments below.

## Real-camera experiments before Phase 2B

1. With the default thin strip and an empty scene, record a few minutes of raw percentages, range, and trace across several keys. Repeat with a taller strip to see how the 10% quantization changes.
2. Introduce a small, fixed lighting or exposure change without a foot. Observe whether readings settle at a nonzero level, flicker, or return toward zero under the existing 2% adaptation.
3. Step into one zone rapidly, hold still for several seconds, then leave slowly. Compare rise, active duration, release timing, and any post-release residual activity.
4. Repeat with a dark shoe, light shoe, shadow only, and a stationary object placed in the strip. These cases test whether apparent stable drift can look identical to occupancy.
5. Change room lighting broadly and move the camera slightly. Check how many zones rise together and when the current broad-change guard suppresses notes.
6. Compare front/rear cameras and frame rates. Note history traces and the wall-clock time taken by the unchanged two-frame release rule.

Phase 2B should be designed from these observations. In particular, a flat 10% signal is not by itself proof of environmental drift, and a zero-range signal may be a stationary object. The shared baseline and overlapping-zone policy remain unchanged.
