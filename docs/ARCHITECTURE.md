# Dance Piano Architecture

## Purpose

This document defines the intended architectural boundaries of Dance Piano.

It describes the target direction. The current implementation may not yet match it.

---

# Runtime Data Flow

Preferred runtime flow:

Camera
↓
Frame Analysis
↓
Zone Detection
↓
Zone State Machine
↓
Trigger / Release Events
↓
Action Engine
↓
Audio / MIDI / Other Outputs

Each layer should know as little as practical about downstream behavior.

---

# Camera

Responsible for:

- camera access
- frame acquisition
- camera lifecycle
- required camera transformations

The camera layer should not understand:

- notes
- scales
- drums
- modules
- musical actions

---

# Detection

Detection determines how much meaningful visual change exists inside a zone.

Conceptual input:

- current frame
- zone geometry
- zone baseline/background state
- detection parameters

Conceptual output:

- activity measurement
- stability information
- data required by the zone state machine

Detection should not play audio or choose musical notes.

Adaptive calibration behavior is described in `docs/DETECTION.md`.

---

# Zone State Machine

The zone layer interprets detection measurements.

Conceptual states may include:

- idle
- candidate activity
- active
- release/cooldown
- adapting

Exact state names should be chosen based on the implementation.

The important distinction is between:

1. transient interaction
2. persistent environmental drift
3. normal background noise

A zone produces semantic events such as:

```text
trigger
release
```

Actions consume these events.

---

# Layout

A layout represents one complete user instrument.

Conceptual structure:

```js
{
  version: 1,
  id: "layout-1",
  name: "Classic Dance Keys",
  modules: []
}
```

Layouts should eventually be serializable.

---

# Modules

Modules are objects users can eventually manipulate in Customize Mode.

Module geometry uses normalized camera coordinates.

Example:

```js
{
  x: 0.05,
  y: 0.75,
  width: 0.90,
  height: 0.20
}
```

Rotation is not required initially.

---

# Keyboard Module

A keyboard module generates multiple adjacent detection zones.

Conceptual structure:

```js
{
  id: "keyboard-1",
  type: "keyboard",

  transform: {
    x: 0,
    y: 0.75,
    width: 1,
    height: 0.25
  },

  config: {
    keys: 16,
    orientation: "horizontal",
    direction: "ascending",
    root: "C",
    scale: "major",
    octave: 3
  }
}
```

The exact musical configuration should reuse existing project concepts where practical.

Changing key count regenerates child zones.

Individual keyboard keys are not independently positioned.

---

# Trigger Module

A trigger is the simplest freely positioned module.

Example:

```js
{
  id: "trigger-1",
  type: "trigger",

  transform: {
    x: 0.05,
    y: 0.40,
    width: 0.15,
    height: 0.20
  },

  detection: {
    sensitivity: 0.18
  },

  action: {
    type: "drum",
    sound: "kick"
  }
}
```

A trigger is not inherently a drum.

Its action determines what it does.

---

# Zones

Zones are runtime detection regions.

A module may generate one or many zones.

Example generated keyboard zone:

```js
{
  id: "keyboard-1:key-3",
  moduleId: "keyboard-1",

  geometry: {
    x: 0.1875,
    y: 0.75,
    width: 0.0625,
    height: 0.25
  },

  action: {
    type: "note",
    note: "F3"
  }
}
```

Generated zones do not need to be persisted if they can be deterministically reconstructed from module configuration.

Runtime detection/calibration state should generally not be persisted.

---

# Actions

Actions describe the consequence of trigger events.

Initial target actions:

```text
note
drum
```

Future possibilities:

```text
sample
chord
midi-note
midi-cc
effect-toggle
loop-control
```

Future actions are not current requirements.

---

# Persistence

Persisted layouts must have a schema version.

Loading should validate persisted data.

Invalid or incompatible customization data must not make the application unusable.

The built-in default layout must always remain recoverable.

Runtime camera baselines should normally be recreated rather than persisted.

---

# Coordinate System

Persist module geometry using normalized coordinates:

```text
x:      0 → 1
y:      0 → 1
width:  0 → 1
height: 0 → 1
```

Pixel coordinates belong at rendering and frame-analysis boundaries.

This keeps layouts independent of camera resolution and display size.

---

# Default Layout

The existing Dance Piano instrument becomes the built-in default layout.

Internally it may use the new module system, but behavior should remain equivalent to the current application.

This provides backwards compatibility and a real-world test of the modular architecture.

---

# Architectural Constraints

Avoid:

- musical behavior inside detection code
- piano-specific assumptions in generic zone detection
- UI state becoming the source of truth for layouts
- persisted pixel geometry
- calibration logic tied specifically to keyboards
- automatic calibration that can learn an actively occupied zone as background

Prefer:

- plain serializable configuration
- deterministic module → zone generation
- generic zone state
- explicit action dispatch
- conservative background adaptation
- independently testable components
