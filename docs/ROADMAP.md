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

# Phase 2 — Adaptive Detection and Calibration

## Goal

Reduce manual calibration and make individual zones resilient to environmental drift.

## Work

- establish independent per-zone runtime detection state
- identify scene/zone stability
- detect persistent low-level drift
- gradually adapt eligible zone baselines
- freeze adaptation during plausible occupancy
- add post-trigger adaptation grace period
- support stronger auto-calibration after global idle + stable conditions
- retain manual calibration
- centralize tuning parameters
- add useful debug instrumentation
- add tests where practical

## Restrictions

Do not build Customize Mode.

Do not add advanced musical actions.

Avoid aggressive calibration heuristics.

## Exit Criteria

- small stable environmental changes can recover without manual calibration
- one drifting zone can recover without forcing unrelated zones to recalibrate
- active/occupied zones are not learned as background under expected use
- global idle can safely refresh calibration
- manual calibration still works
- behavior is observable/debuggable enough to tune

---

# Phase 3 — Generic Trigger Modules

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

# Phase 4 — Customize Mode MVP

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

# Phase 5 — Layout Management and Editor Polish

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

# Phase 6 — Advanced Modules and Actions

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
