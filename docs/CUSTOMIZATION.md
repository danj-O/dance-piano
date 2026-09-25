# Dance Piano Customization

## Current Implementation (Phase 6A)

**Customize Layout** is a top-level performance control. The editor shows the mirrored camera (or a preview placeholder before camera startup) and the current modules. From the classic piano, entering the editor temporarily adds the two Phase 5 trigger modules so keyboard, kick, and snare can all be manipulated. Cancel leaves the original classic layout untouched. Done accepts the three-module layout and edited geometry for this page session only; reloading without the demo query returns to the classic piano. The `?layout=percussion-demo` development URL still starts with the mixed layout.

The editor selects whole modules. Dragging and two corner handles move or resize normalized camera-coordinate rectangles; keyboard keys are regenerated from the keyboard module. Modules are clamped to the displayed camera bounds. Overlap is shown in red during a gesture and the last valid rectangle is kept on release. Detection, adaptive calibration, and musical events pause while editing. Done rebuilds zones and temporal detector state; if geometry changed, the app waits for a fresh camera reference before performance resumes. Cancel restores the entry layout and resets temporal state without replacing its baseline. Camera switching is unavailable inside the editor because Settings is closed there. The Customize action is disabled while camera permission/startup, switching, or manual calibration is in progress.

There is no layout storage, inspector, add/delete/duplicate control, or module configuration editing in this phase. See [PHASE_6A_RESULTS.md](PHASE_6A_RESULTS.md).

---

## Product Goal

Customize Mode turns Dance Piano into a visual body-instrument builder.

Users arrange interactive modules directly over the camera view rather than editing configuration files.

---

# Basic Flow

Normal Mode:

The user performs with the instrument.

The performance toolbar contains:

```text
Customize Layout
```

Customize Mode:

- modules become selectable
- selected modules display editing controls
- modules can be moved and resized
- a future inspector displays module-specific configuration
- accidental musical triggering should not interfere with editing

The user presses `Done` to return to performance.

---

# Direct Manipulation

Users should eventually be able to:

- select a module
- drag it
- resize it
- duplicate it
- delete it

Rotation is not required initially.

Geometry remains normalized internally.

---

# Initial Module Types

## Keyboard

A keyboard automatically creates multiple adjacent zones.

Editable properties should eventually include:

- number of keys
- root
- scale/mode
- octave/range
- ascending/descending direction
- instrument/sound where applicable
- detection sensitivity where applicable

Changing the number of keys regenerates zones.

Individual keys are not independently positioned.

## Trigger

A trigger is one freely positioned interaction region.

Editable properties should eventually include:

- action type
- action-specific configuration
- sensitivity
- relevant trigger behavior

A trigger is not inherently a drum.

Example:

```text
Trigger

Action       Play Drum
Sound        Snare
Sensitivity  [ slider ]

[Duplicate]
[Delete]
```

---

# Example Layout

The architecture should support:

```text
              [ CHIME ]

         [ FX ]     [ FX ]


 [ KICK ]                 [ SNARE ]


| C | D | E | F | G | A | B | C |
```

The lower keyboard can be played with feet.

Side triggers can be hit with hands.

Upper triggers can respond to reaching above the body.

All use the same underlying zone detection system.

---

# Adaptive Calibration

Customize Mode should not require users to manually calibrate every module independently.

Zones should use the shared adaptive detection system described in `docs/DETECTION.md`.

Future editor/debug UI may expose calibration health or adaptation state, but this is not required for the initial editor.

---

# Persistence

Customized layouts should eventually persist locally.

The built-in default must always remain recoverable.

Required capability:

```text
Reset to Default Layout
```

Persisted layout data must be versioned.

---

# Mobile UX

Customization must work well on touch devices.

Requirements:

- large touch targets
- no hover dependency
- obvious selected state
- usable drag/resize behavior
- protection against accidental deletion
- camera/instrument remains visible while editing

---

# Future Layout Management

Later versions may support:

- multiple named layouts
- built-in presets
- duplicate layout
- import JSON
- export JSON
- share layout

These should all use the same serialized layout model.

Do not create separate configuration systems for presets and custom layouts.
