# Phase 2C Results — Global Idle Auto-Calibration

## Runtime flow and state

The frame loop still measures each generated zone against the shared 320 × 240 `Float32Array` reference, updates `ZoneTracker`, and dispatches trigger events before considering calibration. `GlobalIdleCalibration` then inspects the same ratios and Phase 2A telemetry used by the Phase 2B local controller. It never decides musical actions or changes trigger/release rules.

| State | Meaning |
| --- | --- |
| `normal` | No qualifying broad residual drift. |
| `waiting` | Broad drift may be present but there is not enough recent history. |
| `candidate` | Broad low drift and all safety checks pass; the idle dwell is running. |
| `verifying` | Idle dwell passed; the scene must remain safe for another independent dwell. |
| `refreshing` | Coordinated baseline blending is under way and checked on every frame. |
| `blocked` | Occupancy, interaction, unstable history, or the subsequent quiet interval vetoes the process. |
| `cooldown` | A refresh succeeded; another cycle is disarmed until cooldown and drift clearance. |

All timing uses elapsed timestamps. These states, the baseline, and the telemetry history remain in memory only. The existing localStorage keys and their formats are unchanged.

## Eligibility and refresh policy

Global calibration needs at least half the zones, and at least two zones, to show a recent mean above normal noise. This broad-drift requirement distinguishes a scene-wide shift from isolated drift, which Phase 2B can handle. A qualifying zone's activity need not be exactly zero. Every zone must still pass the global safety checks, including zones with no drift. The maximum permitted current or recent activity is the smaller of the Phase 2B effective ceiling and half the selected press threshold. Thus the global path cannot learn an obvious stationary foot merely because it has stopped moving. A high reading below the trigger threshold also vetoes the refresh.

Every zone must be armed, have no trigger or release within five seconds, have at least 1.5 seconds of samples in a two-second window, and stay within the global stability band. A range wider than the band or a sudden rise blocks candidacy. A suspicious frame resets the idle and verification dwell; another two seconds of quiet must follow before candidacy can resume. The candidate must then remain safe for five seconds, followed by four seconds of verification. A trigger, high occupancy, or unstable reading during either dwell cancels it. During refresh, downward ratios are expected as the reference catches up, but a new upward jump, active zone, high reading, or recent interaction stops blending immediately.

The refresh uses the existing `adaptBackground` primitive on zone slices of the shared baseline, with an 800 ms time constant and a maximum 100 ms elapsed blend step, for up to 2.5 seconds. Only currently low, above-noise zones receive a blend. The global coefficient at 100 ms is about 11.8%, compared with the Phase 2B local 3.9%. A guarded blend is safer than an instant full-frame snapshot: it leaves pixels outside detection zones alone, limits how much an unexpected foreground can enter the reference in a single frame, and rechecks eligibility before each update. It is still not proof that a small stationary object is background.

Local adaptation runs while the global controller is normal, waiting, blocked, or in cooldown. It pauses during candidate, verification, and refresh, so the two controllers never write competing baseline updates in one frame. The app creates a fresh local controller whenever that pause begins or ends. On successful global refresh it also creates a new `ZoneTracker`, clearing stale temporal and trigger state, and restarts local adaptation. After success, the global controller waits at least 20 seconds **and** requires broad drift to disappear for two seconds before another cycle can start. This prevents repeated refreshes in an unchanged empty scene.

Startup reference capture, camera switching, stop/start, changed detection settings, zone geometry changes, and manual calibration reset the global state. Manual calibration still discards the old reference, waits 2.5 seconds, captures a new frame, and leaves Step sensitivity unchanged. It remains the explicit recovery option for large camera moves and cases the automatic guards intentionally reject.

## Constants and initial defaults

All global parameters are in `GLOBAL_IDLE_CALIBRATION` in `src/global-idle-calibration.js`. They are initial conservative choices for physical testing, not inferred guarantees.

| Parameter | Default |
| --- | ---: |
| Recent history window / minimum span | 2,000 / 1,500 ms |
| Candidate idle dwell / stable verification | 5,000 / 4,000 ms |
| Trigger or release quiet period | 5,000 ms |
| Additional quiet after suspicious activity | 2,000 ms |
| Broad drift coverage | At least 50% of zones, minimum two |
| High occupancy ceiling | `min(local effective ceiling, 0.5 × pressThreshold)` |
| Normal noise boundary | `min(2%, 0.2 × pressThreshold)` |
| Allowed recent range | `min(6, max(3, 0.5 × global ceiling))` percentage points |
| Refresh time constant / maximum blend step / maximum duration | 800 / 100 / 2,500 ms |
| Successful-refresh cooldown / required clear dwell | 20,000 / 2,000 ms |

The opt-in detector telemetry panel now shows a `GLOBAL` state, reason, actual idle/verification/refresh elapsed time, cooldown, and broad-drift zone count. During an actual global refresh only, a purple progress line appears at the camera strip while telemetry is enabled. Its length represents the fixed refresh window, not a claimed calibration quality or measured completion percentage. Ordinary performance mode has no global overlay.

## Files and verification

- `src/global-idle-calibration.js`: separate global eligibility, state, and blend decisions.
- `src/app.js`: frame-loop coordination, lifecycle resets, and debug feedback.
- `src/detector.js`: background-blend comment updated for both calibration controllers; detector and trigger behavior are unchanged.
- `index.html`: global debug status and explanation; app script cache version updated.
- `test/global-idle-calibration.test.js`: deterministic idle, safety, refresh, handoff, cooldown, and lifecycle coverage.
- `docs/ARCHITECTURE.md`, `docs/DETECTION.md`, `docs/ROADMAP.md`, this report: current implementation and phase status.

`npm test` passes the full suite of 49 tests, including Phase 2B adaptation and existing detection, trigger/release, layout, music, and telemetry tests. `node --check src/app.js` and `git diff --check` also pass. A localhost browser smoke check confirmed the app and Settings load and the opt-in debug panel displays all sixteen keys plus the global status without a runtime error. No production camera was used in that check; physical camera behavior still needs verification.

## Known limits and real-camera checks

An activity ratio alone cannot prove that a stable low-level difference is environmental. A small stationary object affecting several zones below the global ceiling could still be blended, especially if the press threshold and adaptation ceiling have been raised. The global controller protects high occupancy and recent interactions, but manual calibration remains necessary for large scene shifts that cross the safety ceiling. A default very thin strip quantizes activity coarsely (often in ten-point steps), so a single noisy sample can veto a global cycle. The half-of-zones requirement means a scene change affecting fewer zones is left to local adaptation. Overlapping future zones require an explicit shared-pixel policy before this strategy can be generalized to them.

Physical tests to perform before tuning constants:

1. With the camera fixed and strip empty, induce a broad lighting/exposure shift yielding low stable residuals in at least half the keys. Confirm `IDLE`, then `VERIFYING`, then `REFRESHING` and falling ratios. Measure real elapsed times and compare with local recovery.
2. Hold a shoe/person at high occupancy for at least 30 seconds while other zones drift. Confirm `BLOCKED — HIGH OCCUPANCY` or `ACTIVE ZONE`, with no purple refresh line or baseline decay in that zone.
3. Step in and out during candidate, verification, and refresh. Confirm immediate cancellation, the full post-interaction veto, and no further global blending after interruption.
4. Move a small object, cast a moving shadow, and flicker lighting below the trigger threshold. Confirm instability cancels the dwell rather than eventually absorbing the motion.
5. Leave the scene clear after one successful refresh for at least a minute. Confirm cooldown and drift-clear rearm prevent periodic refreshes.
6. Repeat with a one-row strip, a taller strip, front and rear cameras, low frame rate, and manual recalibration/camera switching during an in-progress dwell. Check debug states and that Step sensitivity remains unchanged.

For Phase 2D, use camera traces from these checks to tune dwell, stability band, broad-drift coverage, and quantization handling. In particular, examine whether sparse one-row zones can give reliable whole-scene evidence. Do not widen the global occupancy ceiling merely to make an unsafe large change auto-calibrate.
