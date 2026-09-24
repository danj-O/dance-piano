# Dance Piano — Codex Instructions

## Project Goal

Dance Piano is a browser-based camera instrument. Movement inside regions of the camera image triggers musical actions.

The project is evolving from a fixed floor-piano interface into a customizable visual instrument builder.

Users should eventually be able to arrange keyboards and trigger regions anywhere in the camera view, resize them, configure their behavior, and save layouts.

The instrument should also maintain its own understanding of the background so normal lighting and environmental drift do not require frequent manual recalibration.

---

## Architectural North Star

Keep this dependency direction:

Camera
→ Detection
→ Zones
→ Trigger Events
→ Actions
→ Outputs

Keep this configuration hierarchy:

Layout
→ Modules
→ Zones

Modules describe the instrument.

Zones describe where interaction occurs.

Actions describe what interaction does.

Detection determines whether interaction occurred.

---

## Core Product Principle

The detector should detect activity.

It should not decide what that activity means musically.

Do not make piano keys, drums, samples, MIDI, effects, or other musical behaviors special cases inside the detector.

---

## Core Abstractions

### Layout

A complete instrument configuration containing modules.

Layouts must eventually be serializable and versioned.

### Module

A user-manipulable object positioned using normalized camera coordinates.

Initial target module types:

- `keyboard`
- `trigger`

Do not add additional module types unless required by the current phase.

### Zone

A detection region generated or owned by a module.

Zones use normalized coordinates from 0–1 rather than persisted pixel coordinates.

A zone should eventually maintain enough runtime detection state to support independent triggering and adaptive calibration.

### Trigger Event

A semantic state transition produced by the zone/detection system.

Examples:

- enter / trigger
- release / exit

### Action

Defines what happens when a trigger event occurs.

Examples:

- play note
- play drum

Future actions may include samples, MIDI, effects, and loop controls, but they should not be implemented until requested.

---

## Calibration Principle

Calibration should evolve from a manual global snapshot into an adaptive background model.

The system should eventually support:

- manual calibration as a fallback
- automatic calibration after the scene has been idle and stable
- independent adaptation of individual zones
- detection of persistent environmental drift
- gradual baseline adaptation
- protection against adapting while a person/object is actually occupying a zone
- a short post-trigger grace period before adaptation resumes

A persistent small difference should be treated differently from a rapid large interaction.

Example:

Stable 10% difference for several seconds may indicate environmental drift.

A rapid change from 10% to 40% may indicate a real interaction.

Do not hardcode illustrative percentages or timing values from documentation without validating them against the existing detector and real behavior.

---

## Compatibility

The existing Dance Piano experience remains the default.

Refactors must preserve existing behavior unless the current task explicitly changes it.

A user who never opens customization should still be able to load the application and immediately play the familiar floor piano.

Manual calibration should remain available even after automatic calibration is introduced.

---

## Scope Discipline

Work only on the requested phase.

Do not implement features from later roadmap phases because they appear easy or useful.

Small preparatory abstractions are acceptable when required by the current phase.

Avoid speculative frameworks.

Prefer the smallest architecture that cleanly supports known requirements.

---

## Development Workflow

Before implementation:

1. Read this file.
2. Read `docs/ARCHITECTURE.md`.
3. Read `docs/DETECTION.md`.
4. Read `docs/CUSTOMIZATION.md` when relevant.
5. Read `docs/ROADMAP.md`.
6. Inspect the actual implementation before proposing changes.

During implementation:

- preserve working behavior
- keep responsibilities explicit
- avoid unnecessary dependencies
- maintain mobile/touch compatibility
- use normalized geometry for persisted layouts
- keep detection independent from musical actions
- keep adaptive calibration conservative
- never adapt a baseline simply because a zone has been active for a long time
- version persisted layout data
- do not silently change persistence formats

After implementation:

1. Run available tests/checks.
2. Verify relevant existing behavior.
3. Report files changed.
4. Report architectural decisions.
5. Report tests/checks performed.
6. Report known limitations or risks.
7. Stop at the requested phase.

---

## Project Management Rule

Large changes are implemented as independently verifiable phases.

Do not begin the next phase automatically.

At the end of each phase, provide a concise completion report and wait for further instruction.
