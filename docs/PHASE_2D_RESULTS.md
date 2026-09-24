# Phase 2D Results — Detection tuning and acceptance preparation

## Status and architecture

**Implementation is ready for the real-camera acceptance checklist in [DETECTION_ACCEPTANCE.md](DETECTION_ACCEPTANCE.md). Physical acceptance has not been performed or claimed here.** No detector thresholds or dwell durations were retuned without new camera evidence. The earlier observation that a camera move made all sixteen keys `ACTIVE` is retained as a safety boundary: large moves require an empty-strip manual reference.

The current path is: camera frame → 320 × 240 RGB sample → per-zone changed-pixel ratio against one shared `Float32Array` reference → `ZoneTracker` telemetry and trigger/release decisions → action dispatch → `DetectionRuntime` arbitration between local and global calibration → one approved per-zone baseline blend map. The app dispatches events before applying the blend. `DetectionRuntime` owns the tracker, local controller, and global controller for the current reference/zone set; this makes their handoff one testable unit. Detection does not choose notes or other actions. Camera capture, UI, and storage remain in `src/app.js`.

At startup and after switching cameras, the app waits one second and captures a new full-frame reference. Manual calibration discards the old reference, waits 2.5 seconds for the user to clear the strip, then captures the next frame, with a five-second timeout. Stop/start, switching, manual calibration, and geometry reset replace all temporal controllers. Changing pixel sampling resets tracker and calibration state; other detection setting changes reset the global candidate. The baseline, history, global progress, and timers are runtime-only. Existing localStorage keys and saved formats are unchanged.

## Review findings and changes

1. **Misleading global drift count fixed.** Phase 2C counted every zone with a mean above noise as “low drift,” including keys at 70–100% occupancy. Thus the observed `BLOCKED — ACTIVE ZONE · low drift 16/8` was internally consistent but confusing. The count now includes only low, stable, armed zones without recent interaction. The debug line calls them **safe low zones**, shows active/high/unstable counts, and suggests manual calibration when a large camera move causes occupancy. The active and high-occupancy vetoes remain intact.
2. **Misleading zero-second cooldown fixed.** After the timed global cooldown, rearm still waits for broad drift to clear. Telemetry now reports `WAITING FOR DRIFT TO CLEAR` or real clear-dwell progress instead of `COOLDOWN 0.0s`.
3. **Local/global handoff made explicit.** The frame loop no longer duplicates the arbitration steps. `DetectionRuntime.updateCalibration` returns exactly one blend map. Local state is reset when global candidacy takes or releases control; tracker and local history reset after a successful global refresh. During candidate, verification, and refresh, the local debug label reads `PAUSED GLOBAL` rather than implying the local controller is operating normally. The displayed two-second range now comes from raw tracker history, so it remains meaningful while local adaptation is paused.
4. **Policy values centralized.** User-facing defaults/limits, trigger rules, telemetry retention, local and global calibration constants, and reference-capture waits now live in `src/detection-policy.js`. Export names from the former modules remain available to existing tests/callers. The HTML range inputs mirror user-facing limits; the runtime clamps loaded values.

No evidence from the repository or reported physical observation justified weakening occupancy safeguards, changing default geometry or `pixelStep`, or shortening dwell periods. A large camera shift that makes most keys active is **supposed** to block automatic refresh; the current ratio data cannot distinguish it from a person or object covering the instrument. Manual calibration is the safe recovery path.

## Constant inventory

All values below are defined in `src/detection-policy.js`. “Elapsed” means decisions use timestamps; “sampled” means pixels/frames, not wall-clock timing. Percentages in this table are activity fractions of sampled pixels unless specified.

### User-facing detection and geometry settings

| Name | Default; allowed range | Units and purpose | Basis |
| --- | --- | --- | --- |
| `FRAME_WIDTH`, `FRAME_HEIGHT` | 320, 240 | Pixels in the analysis canvas; controls sampling resolution. Internal. | Spatial |
| `FRAME_FALLBACK_INTERVAL_MS` | 50 ms | Timer cadence if video-frame callbacks are unavailable; actual interval also includes processing time. Internal. | Scheduled time |
| `TELEMETRY_PAINT_INTERVAL_MS` | 250 ms | Caps debug-panel refresh frequency; does not affect detection decisions. Internal. | Elapsed |
| `pixelThreshold` | 50; 10–150 | Sum of absolute RGB channel differences needed for one pixel to count as changed. Settings. | Per sample |
| `pressThreshold` | 30%; 4–60% | Changed-sample fraction needed to enter a key; also bounds local/global ceilings and release threshold. Settings. | Per frame |
| `adaptationCeiling` | 12%; 2–45% | Requested upper local self-calibration activity; effective local cap is also ≤45% and ≤75% of `pressThreshold`. Settings. | Per frame eligibility |
| `cooldownMs` | 300; 100–800 ms | Minimum elapsed time between notes on one key. Settings. | Elapsed |
| `zoneHeight` | 0.5%; 0.5–45% | Default keyboard strip height in normalized frame coordinates; impacts sample count. Settings. | Spatial |
| `zonePosition` | 94%; 0–100% | Default strip position in the remaining vertical space. Settings. | Spatial |
| `pixelStep` | 2; 1–5 pixels | Horizontal/vertical detection sample stride; higher is cheaper and coarser. Settings. | Spatial |

### Triggering, telemetry, and reference capture

| Name | Value | Units and purpose | Basis |
| --- | --- | --- | --- |
| `releaseFraction` | 0.35 × press threshold | A disarmed key must fall below this ratio to count as quiet. Internal. | Per frame |
| `rearmQuietFrames` | 2 | Consecutive quiet frames required to release/rearm; intentionally retained for compatibility. Internal. | Frame count |
| `broadChangeFraction` | 0.5 | Simultaneously pressed fraction of zones that suppresses a broad accidental chord. Internal. | Per frame |
| `historyWindowMs` (telemetry) | 10,000 ms | Maximum raw zone history age. Internal. | Elapsed |
| `historyIntervalMs` | 100 ms | Minimum spacing between retained history samples. Internal. | Elapsed sampling |
| `historyLimit` | 120 samples | Hard cap on retained samples per zone. Internal. | Sample count |
| `startupCaptureDelayMs` | 1,000 ms | Wait before first reference after camera start/switch. Internal. | Elapsed |
| `manualCaptureDelayMs` | 2,500 ms | User clearance period before manual reference capture. Internal. | Elapsed |
| `manualCaptureTimeoutMs` | 5,000 ms | Aborts a manual capture if no suitable frame arrives. Internal. | Elapsed |
| `manualProgressIntervalMs` | 100 ms | Updates the manual-capture progress control; does not determine the capture instant. Internal. | Scheduled time |

### Local adaptation

| Name | Value | Units and purpose | Basis |
| --- | --- | --- | --- |
| `noiseCeiling`, `noisePressFraction` | 2%, 0.2 | Normal noise boundary is `min(2%, 0.2 × pressThreshold)`; shared by local and global policy. | Per reading |
| `maximumActivity`, `maximumPressFraction` | 45%, 0.75 | Effective local cap is `min(user ceiling, 45%, 0.75 × pressThreshold)`. | Per reading |
| `stabilityWindowMs`, `minimumStableSpanMs` | 2,000, 1,500 ms | Recent window and minimum observed span before candidacy. | Elapsed |
| `minimumStableRange`, `maximumStableRange`, `stableRangeFraction` | 6%, 20%, 0.7 | Allowed recent range is `min(20%, max(6%, 0.7 × effective local cap))`. | Windowed ratios |
| `minimumActiveFraction` | 0.65 | At least 65% of recent observations must exceed noise to reject intermittent zero/high flicker. | Sample fraction |
| `normalDwellMs`, `candidateDwellMs` | 600, 4,000 ms | Sustained normal activity clears a candidate; qualified drift must wait four seconds. | Elapsed |
| `postInteractionGraceMs` | 3,000 ms | Local freeze after latest trigger or release. | Elapsed |
| `sharpRiseMinimum`, `sharpRiseMaximum`, `sharpRiseRangeFraction` | 6%, 12%, 0.5 | New-peak threshold is `min(12%, max(6%, 0.5 × tolerated range))`. | Windowed ratios |
| `sharpRiseHoldMs` | 2,000 ms | Hold after a new peak beyond the recent envelope. | Elapsed |
| `baselineTimeConstantMs`, `maximumBlendIntervalMs` | 2,500, 100 ms | Local exponential blend rate; delayed frames are capped to a 100 ms update. | Elapsed, capped per frame |
| `completionDwellMs`, `completionFlashMs` | 600, 900 ms | Confirm measured recovery; then show a brief white completion flash. | Elapsed |
| `minimumActivityMargin` | 0.1 percentage point | Keeps the recovery-progress denominator positive when adaptation begins near noise. | Ratio offset |

### Global idle calibration

| Name | Value | Units and purpose | Basis |
| --- | --- | --- | --- |
| `historyWindowMs`, `minimumHistorySpanMs` | 2,000, 1,500 ms | Recent stability evidence required across **every** zone. | Elapsed |
| `idleDwellMs`, `verificationDwellMs` | 5,000, 4,000 ms | Separate global idle and stable verification periods. | Elapsed |
| `interactionQuietMs`, `suspiciousQuietMs` | 5,000, 2,000 ms | Global trigger/release veto and extra quiet after unsafe scene activity. | Elapsed |
| `driftZoneFraction`, `minimumDriftZones` | 0.5, 2 zones | Need at least half of zones, with a minimum of two, showing safe low drift. | Zone count |
| `maximumPressFraction` | 0.5 | Global ceiling is `min(local effective cap, 0.5 × pressThreshold)`; stricter than local. | Per reading |
| `minimumStableRange`, `maximumStableRange`, `stableRangeFraction` | 3%, 6%, 0.5 | Allowed global recent range is `min(6%, max(3%, 0.5 × global ceiling))`. | Windowed ratios |
| `refreshTimeConstantMs`, `maximumBlendIntervalMs`, `refreshDurationMs` | 800, 100, 2,500 ms | Stronger guarded blend than local, capped per frame and limited in duration. | Elapsed, capped per frame |
| `postRefreshCooldownMs`, `clearDwellMs` | 20,000, 2,000 ms | Prevent repeated global cycles until cooldown passes and broad drift safely clears. | Elapsed |

The Settings sliders declare the same user-facing ranges in `index.html` for interaction; `normalizeSettings` applies the policy limits to saved/input values. No advanced calibration settings were added.

## Frame rate and sampling findings

Local/global dwell, grace, verification, cooldown, and trigger cooldown use elapsed time. New tests compare 33, 100, and 200 ms frame intervals. Telemetry retains at most one sample every 100 ms and uses both an elapsed window and a hard sample cap. Local/global blend coefficients use elapsed time **capped at 100 ms per processed frame**. That cap is intentional protection against a large baseline jump after a stalled camera, but recovery is slower in wall-clock time below roughly 10 FPS. The existing two-quiet-frame release/rearm remains frame-based by design; at low FPS it takes longer to release. The broad-change guard and press decisions are per processed frame.

The default 0.5% strip often resolves to one analysis row. With a 320-pixel frame, sixteen keys, and a two-pixel stride, one key has roughly ten samples, so one changed sample moves the displayed ratio by around ten percentage points. This can make global stability hard to establish and can miss narrow contact. The completed local adaptation handles some quantized stable buckets, but resolution is **not universally sufficient**. There is no repository or physical trace proving a safe replacement geometry or stride, so neither default was changed. A demonstrated miss or safety failure should be logged with camera/geometry details before a separate sampling redesign.

## Tests, limits, and files

`npm test` passes **57 tests**, including combined runtime triggering, local drift with a stationary occupied neighbor, handoff from ongoing local adaptation to global candidacy, global refresh/cancellation, lifecycle resets, safe low-zone counting, and elapsed dwell at three frame intervals. Existing detection, telemetry, layout, and music tests still pass. `node --check src/app.js` and `git diff --check` pass. A localhost browser smoke check verified that the app and debug Settings load with no console errors; this does not validate camera behavior.

Files changed: `src/detection-policy.js`, `src/detection-runtime.js`, `src/detector.js`, `src/telemetry.js`, `src/local-adaptation.js`, `src/global-idle-calibration.js`, `src/app.js`, `index.html`, `test/detection-runtime.test.js`, `docs/DETECTION_ACCEPTANCE.md`, `docs/DETECTION.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and this report.

Remaining limits: image ratios cannot distinguish a low stationary object from environmental drift; a large camera repositioning produces active/high readings and must be manually recalibrated; very low FPS slows capped blending and two-frame release; overlapping future zones need a shared-pixel policy; a one-zone future layout cannot satisfy the current minimum-two global requirement. If physical acceptance finds an occupied zone being learned, a low-drift case permanently stuck despite safe readings, or missed/false notes due to sparse sampling, that requires further detector work before treating the subsystem as stable. No Phase 3 work is included.
