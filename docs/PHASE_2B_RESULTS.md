# Phase 2B Results — Local Adaptive Calibration

## Summary

Each zone now makes an independent, guarded decision about when its portion of the shared camera baseline may gradually change. Persistent low activity can recover without manual calibration. Strong occupancy, recent interaction, and unstable activity freeze local adaptation. There is no global idle auto-calibration.

## Runtime algorithm and states

The frame order is unchanged through measurement and note dispatch: measure raw ratios, update the existing `ZoneTracker`, dispatch trigger events, then run `LocalAdaptation` using the current ratios and Phase 2A telemetry. Its per-zone result is a blend coefficient or no blend. `adaptBackground` applies only approved blends to RGB pixels in that zone, retaining one full-frame `Float32Array` baseline.

The local state is:

| State | Meaning | Baseline update |
| --- | --- | --- |
| `normal` | At or below the low-noise region | No |
| `settling` | Low nonzero activity without enough stable elapsed history | No |
| `candidate` | Stable low activity; guarded dwell is running | No |
| `adapting` | Dwell complete; current frame still passes every guard | Gradual on frames above normal noise; brief zero readings pause blending |
| `recovering` | Activity is falling toward normal after blending | No; waiting to confirm recovery |
| `complete` | Recovery confirmed after 600 ms | No; brief visual confirmation |
| `occupied` | Tracker is disarmed or activity is above the conservative local ceiling | No |
| `grace` | A trigger or release happened recently | No |
| `unstable` | Recent range or sharp rise suggests motion/change | No |

Candidate dwell resets when a guard fails. Brief zero readings within otherwise stable low activity preserve the dwell; 600 ms of continuous normal readings or a normal recent mean ends it. Eligibility is recalculated every processed frame. These states are runtime-only and are never saved.
`LocalAdaptation` is the sole owner of these states; the Phase 2A placeholder eligibility label was removed from the raw telemetry snapshot.

## Initial tuning parameters

All parameters are centralized in `LOCAL_ADAPTATION` in `src/local-adaptation.js`. These are conservative starting values for real-camera tuning, not inferred guarantees about what caused an image change.

| Parameter | Initial value | Reason |
| --- | --- | --- |
| Normal noise ceiling | `min(2%, 0.2 × pressThreshold)` | Keeps zero and small noise out of the adaptation state; the observed stuck 4–5% remains eligible. |
| Maximum local activity | `min(user setting, 45%, 0.75 × pressThreshold)`; setting defaults to 12% and ranges from 2–45% | Lets the user choose the highest activity considered for local recalibration while retaining a margin below triggering. |
| Stability window | 2,000 ms | Uses recent Phase 2A samples rather than a single frame. |
| Minimum span of retained samples | 1,500 ms | Requires sustained observed history in real elapsed time before candidacy. |
| Maximum range in that window | `min(20, max(6, 0.7 × effective ceiling))` percentage points | Allows a fluctuating 10–20% band when the chosen ceiling and press threshold permit it. |
| Minimum active fraction | 65% of recent observations above normal noise | Rejects intermittent zero/high activity even if its total range is permitted. |
| Continuous normal reset | 600 ms | A brief zero bucket does not restart an otherwise stable drift dwell. |
| Candidate dwell | 4,000 ms | Gives a slow step or transient object time to reveal itself before baseline changes. |
| Trigger/release grace | 3,000 ms | Protects partial exits, shadows, blur, and exposure recovery. |
| New-peak margin | `min(12, max(6, 0.5 × tolerated range))` percentage points above the preceding recent maximum | Detects a new jump beyond the established band without treating every 10→20% oscillation as fresh motion. |
| Sharp-rise hold | 2,000 ms | Requires a quiet interval after that jump before reconsideration. |
| Baseline time constant | 2,500 ms | Blends more quickly after the guarded dwell; at 50 ms frame spacing the coefficient is about 1.98% per frame. |
| Maximum blend interval | 100 ms | Prevents one delayed camera frame from causing a large catch-up blend. |

At the current default 30% press threshold and default 12% activity setting, the effective ceiling is 12%; a stable 10% bucket can qualify. With a user-selected or older saved 8% press threshold, the effective ceiling cannot exceed 6%, so the observed 4–5% drift remains eligible if the setting permits it. Manual calibration no longer changes the press threshold. The settings panel displays the effective ceiling. The observed 70–100% stationary object is far above the ceiling and cannot become eligible merely by remaining still. A reading above the local ceiling but below a user-raised press threshold also remains frozen. The controller never treats stability alone as proof of background.

For a 10–20% drift band, the user must set the activity limit above its peaks and have a step threshold high enough that the *effective* limit exceeds those peaks (at least about 27% for a 20% peak). If the readings reach the trigger threshold, the zone is occupied and local adaptation remains frozen. Manual calibration is the recovery route when the scene cannot safely meet those conditions.

The blend coefficient is `1 − exp(−min(elapsedSincePreviousFrame, 100 ms) / 2,500 ms)`. It is applied to each RGB baseline channel in an eligible zone. The next frame is compared with the updated baseline. A brief zero reading pauses blending without ending an otherwise valid candidate or adapting state; sustained normal readings or any other guard failure reset it. No instant reference replacement or per-zone image buffer was introduced. The faster rate is intended to make recovery feel immediate after the dwell; it also increases the cost of mistakenly classifying a small stationary object as drift.

## Visual feedback

The opt-in detector telemetry panel labels zones `NORMAL`, `SETTLING`, `DRIFT` with real dwell time, `ADAPTING`, `PAUSED LOW`, `FINISHING`, `RECALIBRATED`, `OCCUPIED`, `FROZEN`, or `UNSTABLE`. Every key now shows an amber progress bar during the four-second candidate dwell and a cyan bar as the recent activity recovers toward normal. The cyan bar represents measured recovery, not a promised completion time. After low activity remains confirmed for 600 ms, a white bar flashes for 900 ms. The bar sits just outside very thin strips and inside taller keys; note-trigger green still has priority. Manual calibration remains available.

## Files changed and verification

- `src/local-adaptation.js`: per-zone state machine, centralized guard parameters, time-based blend decisions.
- `src/detector.js`: background blending now consumes the per-zone decisions rather than the old instantaneous low-ratio cutoff.
- `src/telemetry.js`: removed the obsolete placeholder adaptation label; raw temporal measurements remain intact.
- `src/app.js`: runs the controller after existing trigger processing, resets it with reference/tracker resets, and shows adaptation feedback.
- `index.html`, `styles.css`: debug explanation, state layout, and cache refresh.
- `test/local-adaptation.test.js`, `test/detector.test.js`, `test/telemetry.test.js`: deterministic drift, safety, reset, blending, and API tests.
- `docs/DETECTION.md`, `docs/ROADMAP.md`, this report: updated current implementation and future phase sequence.

`npm test` passes 37 tests, including 10–20% fluctuating drift, intermittent zero/high rejection, flickering low activity, and the configurable ceiling alongside existing trigger/release, music, layout, and Phase 2A telemetry tests. The note tracker still uses the same press/release thresholds, two-frame rearm, cooldown, and broad-change suppression. Camera access, action dispatch, and audio are unchanged. Manual recalibration now refreshes only the frame reference; the former calibration-threshold estimate has been removed. The ceiling remains an additive field in the existing `dance-keys-settings-v2` localStorage record; saved settings without it receive the 12% default.

A local browser smoke check confirmed the app and Settings load, debug mode shows all sixteen compact key rows, and no console errors occur. Live camera adaptation and the cyan on-camera bars still require physical verification.

## Known failure modes and real-camera experiments

An image ratio cannot prove whether a stable difference is environmental drift or a stationary object/shadow. This policy limits magnitude, waits for elapsed history and dwell, and protects recent interactions, but may still assimilate an object that remains below the upper ceiling. Raising both the step threshold and activity ceiling increases that risk; use the smallest ceiling that clears the observed drift. Intermittent 0/10% flicker remains ineligible because too many readings return to normal. A large scene change above the ceiling still requires manual calibration or the later global idle mechanism. Existing reference capture can still learn an object already present at startup or during manual calibration. Future overlapping zones need a shared-pixel safety policy.

Before changing constants, test on a real camera:

1. Make one zone settle at 4–5%, then at 10%. Note time spent in `SETTLING`, `DRIFT`, and `ADAPTING`, and whether the raw reading returns to normal.
2. Hold a shoe or object at 70–100% for at least 30 seconds. Confirm `OCCUPIED` stays visible and the ratio does not decay.
3. Slowly enter and partially leave a zone. Confirm a sharp change cancels adaptation and release starts the full three-second `FROZEN` interval.
4. Move only one part of the background. Confirm unrelated zones remain `NORMAL` and their readings do not change from local blending.
5. Compare thin and tall strips, front and rear cameras, low and high frame rates, shadows, auto-exposure shifts, and camera motion. Look for a stable small object being learned or genuine drift that never reaches `DRIFT`.
6. Keep manual calibration available as the recovery path when a change is too large for this conservative local policy.

## Phase 2C boundary

Global idle auto-calibration should have a separate whole-scene eligibility policy. It may reuse the shared pixel-blending primitive and telemetry but must not infer safety merely because no notes fired or because zones are stationary. Do not widen the local upper ceiling to solve global changes; evaluate scene stability and occupancy across all zones first.
