# Detection and Adaptive Calibration

## Goal

Dance Piano should remain playable as lighting, camera exposure, and background conditions change.

Manual calibration remains available, but normal use should require progressively less manual intervention.

Calibration must operate at the generic zone level so every future module benefits from it.

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
