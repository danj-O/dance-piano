# Detection and Adaptive Calibration

## Goal

Dance Piano should remain playable as lighting, camera exposure, and background conditions change.

Manual calibration remains available, but normal use should require progressively less manual intervention.

Calibration must operate at the generic zone level so every future module benefits from it.

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
