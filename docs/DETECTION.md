# Detection and Adaptive Calibration

## Goal

Dance Piano should remain playable as lighting, camera exposure, and background conditions change.

Manual calibration remains available, but normal use should require progressively less manual intervention.

Calibration must operate at the generic zone level so every future module benefits from it.

---

## Current Implementation (Phase 5 mixed modules)

Keyboard keys and trigger modules supply the same normalized zone geometry to frame measurement, tracking, local adaptation, and global idle calibration. The baseline remains one shared full-frame array, so overlapping module rectangles are rejected before zones are generated. Broad-change suppression still uses half of the active zones, but now checks both the full layout and each module with at least four zones. At least four zones must be active for suppression. This preserves the classic keyboard's eight-key guard when two independent trigger zones are added, while a single trigger remains playable. The policy is based on zone grouping, not action or sound type. Global idle calibration still counts safe low zones across the complete layout and blocks on any genuinely active/high zone; a camera move still calls for manual calibration. See [PHASE_5_RESULTS.md](PHASE_5_RESULTS.md).

---

## Current Implementation (Phase 2D review)

`src/detection-policy.js` is the current source of detector/calibration defaults, limits, and internal timing. `src/detection-runtime.js` owns the tracker and both calibration controllers for a reference; it returns one approved baseline-update map per frame. Global telemetry now counts only **safe low zones**, not high or active zones, and identifies the rearm wait after cooldown. Local telemetry explicitly says when global calibration has paused it. A large camera move can make many keys active and is intentionally blocked from automatic calibration; clear the strip and use the manual reference. See [PHASE_2D_RESULTS.md](PHASE_2D_RESULTS.md) for the full policy inventory and [DETECTION_ACCEPTANCE.md](DETECTION_ACCEPTANCE.md) for physical acceptance.

The numbered implementation sections below record the state reached at each earlier phase; their historical descriptions and source-file locations should not be read as the current code path.

---

## Current Implementation (Phase 2C global idle calibration)

`GlobalIdleCalibration` observes the same zone readings and Phase 2A telemetry as local adaptation, but has a separate conservative eligibility policy. At least half of the zones (and at least two) must have stable low residual activity before the app pauses local adaptation and starts a five-second global idle dwell. Four additional seconds verify the scene. Any active zone, recent trigger/release, current or recently high occupancy, or unstable activity blocks or cancels the process. A guarded refresh then blends the eligible zone portions of the shared baseline with an 800 ms time constant for up to 2.5 seconds, checking safety on every frame. It does not replace the full camera reference or update pixels outside the zones.

The global controller and local controller never issue baseline writes on the same frame. Local adaptation is reset when global candidacy starts or ends, and both tracker history and local adaptation are reset after a successful refresh. A successful refresh starts a 20-second global cooldown and requires the broad drift signal to clear for two seconds before another global cycle can start. All global state is runtime-only. The opt-in detector telemetry panel reports global state and real elapsed times; a purple line appears over the camera only during a global refresh while telemetry is enabled. Manual calibration still takes an explicit new frame and resets both automatic controllers. See [PHASE_2C_RESULTS.md](PHASE_2C_RESULTS.md) for constants, limitations, and physical tests.

---

## Current Implementation (Phase 2B local adaptation)

The app still compares each zone with one shared full-frame `Float32Array` baseline. After the unchanged `ZoneTracker` processes a frame, `LocalAdaptation` uses its Phase 2A telemetry to decide which zones may blend their baseline pixels toward that frame. It is now the sole owner of adaptation state; the former observational placeholder in `ZoneTelemetry` has been removed. `adaptBackground` only applies the approved per-zone blend amounts; the old instantaneous `0.35 × pressThreshold` eligibility cutoff has been removed from background updates. Trigger/release thresholds and two-frame rearm are unchanged.

The controller distinguishes `normal`, `settling`, `candidate`, `adapting`, `recovering`, `complete`, `occupied`, `grace`, and `unstable`. Recent readings may fluctuate within an activity band rather than staying at one percentage. The tolerated range grows with the effective activity ceiling, up to 20 percentage points; a new peak well outside the recent band still interrupts candidacy. At least 65% of recent observations must be above normal noise, so intermittent zero/high flicker does not qualify. After 1.5 seconds of sampled history, a qualified zone completes a separate four-second candidate dwell. Brief zero readings within a drift band do not restart that dwell, but sustained normal readings do. A zone that is disarmed, recently triggered or released, above the upper activity ceiling, or showing a sharp new peak cannot adapt. Settings lets the user set the maximum self-calibration activity from 2–45%; the effective ceiling also remains at or below 75% of the press threshold. The shared baseline is blended gradually only on eligible frames above normal noise; each frame rechecks eligibility. Manual calibration and camera-switch capture still take fresh references and reset local adaptation state. Amber and cyan bars over each key show candidate dwell and baseline recovery, followed by a white completion flash. The debug panel also shows state and timing.

Initial constants and their rationale are recorded in [PHASE_2B_RESULTS.md](PHASE_2B_RESULTS.md) and defined in `src/local-adaptation.js`. A stable low reading is only a guarded candidate, never proof of background; a small stationary object or shadow can still resemble drift. The Phase 2C global policy is separate and more conservative.

Manual recalibration now refreshes only the shared frame reference. It waits 2.5 seconds, captures the next camera frame, and resets per-zone trigger/adaptation state. Step sensitivity defaults to 30% for new or reset settings and is never inferred from calibration noise; a saved sensitivity remains in effect until the user changes it. The former percentile-based threshold estimate has been removed.

---

## Current Implementation (Phase 2A telemetry foundation)

`ZoneTracker` records per-zone raw ratios and event timestamps on each processed detection frame. It keeps up to ten seconds of approximately 100 ms spaced samples, capped at 120 samples per zone. Snapshots expose elapsed idle/trigger/release times, recent mean, range, standard deviation, largest sampled rise, and the latest frame-to-frame ratio change. Inactive time starts only when the zone is armed and below the existing press threshold; active means disarmed, including when an entry was suppressed by cooldown or the broad-change guard. `blocked-active` and `unassessed` are observational adaptation labels, not a decision to update the baseline.

The existing shared baseline update still uses only the raw ratio and `0.35 × pressThreshold` cutoff. No telemetry is consulted by detection, triggering, calibration, or adaptation. A ten-point default signal step makes a stable 10% reading appear flat while 0/10% flicker has a ten-point range. The debug panel reports these raw statistics instead of declaring either pattern to be safe drift. See [PHASE_2A_RESULTS.md](PHASE_2A_RESULTS.md) for experiments to guide Phase 2B.

---

## Current Implementation (Phase 1 update)

`measureZones` now receives generated normalized zone geometry and returns `{zoneId, ratio}` readings. `ZoneTracker` emits ID-based `trigger` and `release` events. The pixel comparison, sampling, two-frame rearm, cooldown, half-of-zones broad-change guard, global threshold estimate, shared full-frame `Float32Array` baseline, and per-region 2% low-activity baseline update are unchanged. No idle calibration, independent zone baseline, drift history, or post-trigger adaptation grace period has been added.

The geometry now comes from the default keyboard module. Adaptation still updates pixels in the shared baseline for each eligible zone; future overlapping zones need a defined shared-pixel policy before they are supported.

---

## Current Implementation and Constraints (Phase 0 audit, 2026-09-24)

The app downsamples each camera frame to 320 × 240 and compares sampled RGB pixels with one full-frame empty-floor snapshot. A pixel is changed when the sum of its three absolute channel differences exceeds `pixelThreshold`; each key's activity is changed samples divided by samples examined. The default strip is 0.5% of frame height. At its default position in a 320 × 240 frame it occupies one sampled row and ten sampled columns per key, so one changed sample moves a ratio by 10 percentage points.

`adaptBackground` already moves the shared baseline toward the current frame by 2% **per processed frame**, but only in a key slice whose changed ratio is below `0.35 × pressThreshold`. It updates every RGB pixel in that eligible slice, including any individually changed pixels. There is no stability duration, trigger/release grace period, elapsed-time normalization, or independent per-zone baseline. This existing behavior is limited low-activity adaptation, not the adaptive-calibration system proposed below. A steady moderate difference above the eligibility cutoff cannot recover through this path, while a small persistent object below the cutoff can be learned.

Manual calibration discards the baseline, waits 500 ms, captures one new full-frame reference, and collects the maximum key ratio per frame until a 2.5-second timer ends. The 90th percentile of those maxima determines one global `pressThreshold`; only that threshold is saved. The baseline and samples are runtime-only. Startup and camera switching also capture a fresh reference after a one-second wait, without the threshold-estimation step. None of these captures checks that the scene is empty or stable; a stationary person or object present during capture becomes the reference.

The present ratio alone cannot tell stable environmental drift from a stationary object. Future per-zone decisions require time history and a conservative occupancy guard; a stronger global-idle refresh should use separate eligibility rules even if it shares frame measurements and baseline-update primitives with local adaptation. With overlapping future zones, independent adaptation also requires an explicit shared-pixel policy or separate zone baselines.

See [PHASE_0_AUDIT.md](PHASE_0_AUDIT.md) for the audit details. The sections below describe desired future behavior.

---

# Problem

A static calibration frame can become stale.

Examples:

- ambient lighting changes
- camera auto-exposure changes
- shadows move
- background objects move slightly
- camera noise changes

A zone may then report persistent low-level activity even though nobody is interacting with it.

Example:

```text
0% → 1% → 0% → 2%

environment changes

9% → 11% → 10% → 10% → 11%
```

If the trigger threshold is nearby, the zone loses useful detection range and may behave incorrectly.

---

# Desired Behavior

The system should distinguish:

## Normal background

Small, noisy changes around the current baseline.

No action required.

## Environmental drift

A relatively stable difference that persists over time without resembling a real interaction.

The baseline may gradually adapt toward the new environment.

## Interaction

A sufficiently significant change that behaves like a person/object entering the zone.

Generate a trigger and freeze background adaptation.

---

# Per-Zone State

Each zone should eventually maintain independent runtime state.

Conceptually:

```js
{
  activity: 0,
  state: "idle",

  baseline: "...",

  idleDurationMs: 0,
  stableDurationMs: 0,

  lastTriggerAt: null,
  lastReleaseAt: null
}
```

This is conceptual only.

Use data structures appropriate to the actual detector.

---

# Local Adaptive Calibration

A zone showing persistent low-level difference may gradually update its baseline.

Conceptually:

```text
small/moderate difference
+
stable for sufficient time
+
zone is not considered occupied
+
outside post-trigger grace period
=
eligible for slow adaptation
```

Adaptation should generally be gradual rather than an abrupt reset.

Conceptual model:

```text
new baseline =
mostly old baseline
+
small contribution from current background
```

The actual algorithm must be selected based on the existing detector representation.

---

# Freeze During Interaction

Baseline adaptation must stop when a zone is plausibly occupied.

Otherwise a person standing still could eventually become part of the background.

Example failure:

```text
person enters
→ activity rises
→ zone triggers
→ system adapts toward occupied image
→ person becomes baseline
→ trigger disappears incorrectly
```

Avoid this.

---

# Post-Trigger Grace Period

After a zone releases, adaptation should not immediately resume.

A short grace period allows:

- the person to fully leave the region
- shadows to disappear
- motion blur to settle
- camera exposure to stabilize

Exact timing must be determined experimentally.

---

# Global Idle Auto-Calibration

The system may also perform stronger calibration when the entire instrument appears unused.

Conceptual conditions:

```text
no zones active
+
instrument idle for sufficient time
+
scene sufficiently stable
=
safe opportunity to refresh background
```

Do not recalibrate merely because no trigger crossed its threshold.

Low-level unstable motion may still mean the scene is unsuitable.

---

# Manual Calibration

Manual calibration remains available.

It serves as:

- initial setup fallback
- recovery mechanism
- debugging tool
- explicit user override

Automatic calibration should reduce dependence on the button, not remove it.

---

# Thresholds and Timing

Documentation examples such as:

```text
5%
10%
15%
3 seconds
5 seconds
```

are illustrative only.

Do not copy them directly into production constants.

Determine useful defaults from:

- current detector behavior
- existing sensitivity semantics
- camera noise
- real testing

Keep important tuning parameters centralized rather than scattering magic numbers throughout the code.

---

# False Adaptation Risk

The most important failure to avoid is learning a real person/object as background.

Prefer conservative adaptation.

If uncertain whether a zone is environmental drift or actual occupancy, do not aggressively recalibrate it.

---

# Debugging

Development/debug visualization should make adaptive detection understandable.

Useful information may include:

- raw activity
- effective activity
- current zone state
- baseline/adaptation state
- time since trigger/release
- whether adaptation is frozen

Do not expose all debugging information in the normal user interface.

---

# Relationship to Modules

Adaptive detection belongs to zones, not specific module types.

Therefore:

```text
Keyboard key
Trigger pad
Drum trigger
Future MIDI region
Future sample pad
```

all inherit the same background-management system.

This is why adaptive detection should be established before the customizable module system becomes complex.
