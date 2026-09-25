# Dance Piano Architecture

## Purpose

This document defines the intended architectural boundaries of Dance Piano.

It describes the target direction. The current implementation may not yet match it.

---

## Current Implementation (Phase 5 trigger modules)

`src/layout.js` supports a normalized, nonoverlapping `trigger` module alongside the classic keyboard. Each trigger deterministically generates one runtime zone with its own stable ID, geometry, label, and configured action. The opt-in `?layout=percussion-demo` layout adds two independent drum triggers to the unchanged default keyboard. `src/app.js` measures and renders all generated zones; `src/actions.js` sends drum triggers to the small percussion path in `src/audio.js`. Detection and both calibration controllers continue to operate on zone IDs and ratios without reading musical action types. The generic broad-change guard now preserves the classic keyboard's eight-of-sixteen boundary when single-zone modules are present. No layout persistence or editor exists. See [PHASE_5_RESULTS.md](PHASE_5_RESULTS.md).

---

## Current Implementation (performance controls)

The performance toolbar exposes the same manual empty-floor calibration action used in Detection Settings. Both buttons call one calibration lifecycle in `src/app.js`; the detector's capture and adaptation rules are unchanged. A session-only Mute toggle controls a master gain after the compressor in `src/audio.js`, silencing dry notes and the reverb/delay returns together while voice and camera state continue running. The toggle is not part of saved music or layout configuration.

---

## Current Implementation (Phase 4 Settings UI)

Settings is one overlay with transient root/category navigation in `src/settings-navigation.js`. `src/app.js` binds the four pages—Instrument, Effects, Camera & Display, and Detection—to the existing setting handlers and localStorage keys. Instrument groups the current keyboard's note mapping, sound, one-shot/gate mode, and ADSR controls; this is a UI boundary for future module editing, not module persistence. Effects, camera/display, and detection controls remain app-level. The detector and audio runtime paths described below are unchanged. See [PHASE_4_RESULTS.md](PHASE_4_RESULTS.md).

---

## Current Implementation (Phase 3 audio interaction)

Generated keyboard zones now carry note actions with an explicit `oneShot` or `gate` mode, sound choice, and optional ADSR override. `src/actions.js` interprets the unchanged detector `trigger`/`release` events. `src/audio.js` owns finite one-shot voices, gated noteOn/noteOff voices, envelope automation, and cleanup. A gated voice is owned by its zone ID, so duplicate pitches from different zones remain independent. The existing default keyboard remains one-shot. See [PHASE_3_RESULTS.md](PHASE_3_RESULTS.md).

---

## Current Implementation (Phase 2D review)

`DetectionRuntime` coordinates the existing tracker, local adaptation, and global idle calibration for each camera reference. `src/detection-policy.js` centralizes their configuration without changing saved settings. The app continues to own camera lifecycle, action dispatch, and UI. The opt-in debug panel reports safe low-zone counts and blocked/rearm reasons. See [PHASE_2D_RESULTS.md](PHASE_2D_RESULTS.md) and [DETECTION_ACCEPTANCE.md](DETECTION_ACCEPTANCE.md). Earlier numbered implementation sections are historical snapshots.

---

## Current Implementation (Phase 2C global idle calibration)

`src/global-idle-calibration.js` adds a whole-scene policy above the existing local controller. It observes zone measurements and tracker telemetry, waits for broad stable low activity with no occupancy or recent interaction, then approves a short coordinated blend through the same shared-baseline primitive. `src/app.js` arbitrates baseline writes and resets temporal state at handoff. This global runtime state is not persisted and does not change the layout, trigger events, or action path. See [PHASE_2C_RESULTS.md](PHASE_2C_RESULTS.md).

---

## Current Implementation (Phase 2B local adaptation)

`src/local-adaptation.js` now decides independently for each zone whether recent telemetry supports guarded, gradual baseline blending. It keeps candidate dwell, new-peak, and post-interaction timing separately from the unchanged trigger state machine. `src/detector.js` applies only approved per-zone blend coefficients to the shared full-frame baseline. The camera overlay shows candidate, recovery, and completion progress; the optional debug panel exposes per-zone state and timing. Manual calibration refreshes the frame reference and leaves the saved Step sensitivity unchanged. The existing note path remains in place. See [PHASE_2B_RESULTS.md](PHASE_2B_RESULTS.md) for parameters and limitations.

---

## Current Implementation (Phase 2A telemetry foundation)

Each `ZoneTracker` now also owns bounded, elapsed-time telemetry for every zone ID. The tracker records raw activity, trigger/release timestamps, continuous inactive time, a recent activity window, and summary statistics. Its existing event decisions are unchanged. A temporary debug panel in the app exposes these observations without persisting them or feeding them into calibration or background adaptation. See [PHASE_2A_RESULTS.md](PHASE_2A_RESULTS.md).

---

## Current Implementation (Phase 1 module foundation)

The default instrument is now a versioned, in-memory layout with one keyboard module. `src/layout.js` derives its normalized strip geometry from the existing `zoneHeight` and `zonePosition` settings, then deterministically generates sixteen camera-coordinate zones with stable IDs and note actions. Generated zones are runtime data, not saved layout data. The existing four localStorage keys and their formats remain unchanged.

`src/app.js` supplies those zones to generic frame measurement and background adaptation in `src/detector.js`. `ZoneTracker` keeps armed/quiet-frame/cooldown state by zone ID and emits `trigger` and `release` events. `src/actions.js` dispatches note triggers to the existing `DanceAudio.play(note)` method; releases only mark the rearm transition. The canvas mirrors the camera, and the generated camera-order notes reverse the low-to-high scale once, so screen-left remains the lowest note.

The shared full-frame baseline and global manual calibration are unchanged. Broad-change suppression still checks whether half or more of the supplied zones are above threshold. That policy matches the default keyboard but needs reconsideration before mixed module types are introduced. The app still owns camera lifecycle, frame loop, calibration session, UI, and storage. See [PHASE_1_RESULTS.md](PHASE_1_RESULTS.md) for parity evidence and remaining constraints.

---

## Current Implementation (Phase 0 audit, 2026-09-24)

The running app is a fixed sixteen-key piano. `src/app.js` owns the camera, frame loop, shared background frame, UI, calibration session, note mapping, and calls to audio. `src/detector.js` computes sixteen ratios from equal-width slices of one horizontal strip and holds an `armed`/quiet-frame/cooldown state for each slice. Its output is a list of key indices, which `src/app.js` maps directly to notes and sends to `DanceAudio`. There are no layout, module, zone, trigger-event, or action objects yet.

The current detector does not import music code, but its geometry, array lengths, and broad-change rule assume exactly sixteen keyboard keys. The visible canvas mirrors the camera; the app reverses the note array so the screen reads low to high from left to right. Any future zone geometry should have an explicit camera-coordinate convention and a separate display transform.

Current `zoneHeight` is a fraction of camera-frame height. `zonePosition` is a fraction of the vertical *space left after the strip height is removed*: the top edge is `(1 - zoneHeight) * zonePosition`. This differs from the proposed module transform's normalized top-left `y`. A default-layout adapter will need to preserve this mapping and the existing saved settings.

The first frame captured after startup, camera switch, or manual calibration is one full-frame `Float32Array`. Detection and adaptation use only the strip; per-key updates modify disjoint parts of the shared array. A zone's update eligibility and its baseline storage need not be the same object, but overlapping future zones cannot independently update shared pixels without a defined policy. The proposed runtime diagram should show zone geometry as an input to detection, rather than suggesting zones are created after detection.

See [PHASE_0_AUDIT.md](PHASE_0_AUDIT.md) for the full current-state inventory and Phase 1 boundaries. The sections below remain the target architecture.

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
