# Dance Piano Roadmap

## Development Strategy

Each phase must leave Dance Piano working.

Complete, verify, and report one phase before beginning another.

Do not implement later-phase features unless explicitly requested.

---

# Phase 0 — Repository Audit and Architecture Reconciliation

## Goal

Understand the actual implementation before modifying runtime behavior.

## Work

- inspect current source
- map camera lifecycle
- map current detection algorithm
- map calibration implementation
- map key triggering/state behavior
- map music/audio responsibilities
- map UI/settings responsibilities
- map persistence
- identify piano-specific coupling
- identify tests and development checks
- compare actual architecture with proposed documentation
- update documentation where reality requires clarification

## Restrictions

No functional runtime changes.

Do not refactor production code.

## Exit Criteria

Produce a report containing:

- current runtime data flow
- relevant files/functions
- current calibration algorithm
- current trigger algorithm
- current persistence behavior
- architectural coupling that Phase 1 must address
- risks/unknowns
- recommended Phase 1 implementation boundaries

Stop after the report.

---

# Phase 1 — Module Foundation

## Goal

Run the existing floor piano through generic layout/module/zone/action abstractions without intentionally changing user-visible behavior.

## Introduce

- Layout
- Module
- Zone
- Action

## Work

- define initial versioned layout model
- represent current piano as a keyboard module
- generate keyboard zones from module configuration
- remove piano-specific assumptions from generic detection where practical
- produce generic zone trigger/release events
- route events through actions
- preserve existing audio/music behavior
- preserve existing calibration behavior for this phase unless architectural separation requires mechanical movement of code

## Restrictions

Do not add Customize Mode.

Do not add arbitrary trigger modules.

Do not redesign adaptive calibration yet.

## Exit Criteria

- existing Dance Piano behavior remains equivalent
- default piano is represented as a module
- keys are generated as zones
- detection can operate on generic zones
- musical consequences occur downstream of detection
- architecture can support multiple future modules

---

# Phase 2A — Detection Telemetry (completed)

## Goal

Observe raw per-zone activity, elapsed trigger/release and idle timing, and recent stability before choosing adaptation rules.

See [PHASE_2A_RESULTS.md](PHASE_2A_RESULTS.md). This phase added bounded runtime telemetry and an opt-in debug panel without changing baseline behavior.

---

# Phase 2B — Local Adaptive Calibration (completed)

## Goal

Let individual zones recover from persistent, low-level environmental drift while protecting occupied zones and recent interactions.

## Work

- use temporal zone telemetry to identify stable, low-activity candidates
- require elapsed candidate dwell and post-interaction grace
- stop adaptation on high occupancy or rapid activity changes
- blend only eligible zone pixels in the shared baseline
- show candidate, frozen, and adapting states in debug mode
- retain manual calibration and existing trigger/audio behavior

See [PHASE_2B_RESULTS.md](PHASE_2B_RESULTS.md) for the implementation and real-camera checks.

## Restrictions

Do not add global idle auto-calibration or layout editing.

---

# Phase 2C — Global Idle Auto-Calibration

## Goal

Allow a stronger shared-reference refresh only when the entire scene is demonstrably idle and stable. Keep eligibility distinct from local zone adaptation and preserve the manual fallback.

See [PHASE_2C_RESULTS.md](PHASE_2C_RESULTS.md) for the implementation, safeguards, and real-camera verification plan.

---

# Phase 2D — Real-World Detection Tuning

## Goal

Use camera experiments to tune sampling, thresholds, timing, drift guards, and debug feedback without expanding the instrument model.

---

# Phase 3 — Audio Interaction Model

## Goal

Support explicit `noteOn`/`noteOff` interaction, sustained or gated notes, and ADSR while preserving the current one-shot trigger behavior.

---

# Phase 4 — Settings and UI Redesign

## Goal

Reorganize global settings, separate them from module-specific configuration, and prepare reusable module-inspector patterns.

---

# Phase 5 — Generic Trigger Modules

## Goal

Prove the architecture works beyond a keyboard.

## Work

- implement generic trigger module
- support multiple simultaneous modules
- allow triggers at arbitrary normalized positions and sizes
- support initial trigger actions
- support appropriate per-trigger detection configuration
- create a development/test layout such as:

```text
side trigger + keyboard + side trigger
```

Configuration may remain code-driven.

## Restrictions

Do not build the visual editor yet.

## Exit Criteria

- keyboard and independent triggers work simultaneously
- trigger modules use the same zone detection/calibration system
- actions do not require detector-specific musical logic
- multiple modules coexist correctly

---

# Phase 6 — Customize Mode MVP

## Goal

Allow users to visually build an instrument.

## Work

- Settings → Customize Layout
- enter/exit Customize Mode
- module selection
- drag
- resize
- add keyboard
- add trigger
- duplicate
- delete
- edit keyboard key count
- edit keyboard musical settings
- edit trigger action
- edit relevant detection settings
- persist customized layout
- reset to default

Prioritize touch interaction.

## Exit Criteria

A user can build, without source editing:

- keyboard along bottom
- trigger on left
- trigger on right
- trigger above the body

and then immediately perform with that layout.

---

# Phase 7 — Layout Management and Editor Polish

Potential work:

- named layouts
- multiple saved layouts
- built-in presets
- Classic Dance Keys preset
- Piano + Drums preset
- duplicate layout
- import/export JSON
- improved touch editing
- undo/cancel
- persistence migration
- improved calibration visualization
- improved selection/resize UX

Finalize scope before implementation.

---

# Phase 8 — Advanced Modules and Actions

Candidates:

- user samples
- chords
- pad grids
- MIDI note output
- MIDI CC
- effect controls
- loop controls
- continuous controls
- XY controls
- additional zone shapes
- rotation
- sophisticated trigger modes

Each feature should be justified by an actual use case.

Do not implement the entire candidate list automatically.

---

# Architectural North Star

Runtime:

```text
Camera
→ Detection
→ Zones
→ Trigger Events
→ Actions
→ Outputs
```

Configuration:

```text
Layout
→ Modules
→ Zones
```

Calibration:

```text
Environment
→ Zone baseline
→ Activity measurement
→ Stability / occupancy decision
→ Conservative baseline adaptation
```

Modules describe the instrument.

Zones describe where interaction occurs.

Actions describe what interaction does.

Detection remains ignorant of musical meaning.
