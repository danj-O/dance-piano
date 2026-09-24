# Phase 4 Results — Settings and UI redesign

## Scope and result

The old Settings panel was one long scroll containing calibration, camera choice, display toggles, music, effects, and detection controls. It made common controls hard to find on a phone and put detector diagnostics beside ordinary choices.

Settings now opens to four drill-down categories inside the same overlay: **Instrument**, **Effects**, **Camera & Display**, and **Detection**. The header keeps a visible Close button and, on a category page, a Settings back button. Closing and reopening always returns to the root. The navigation state is transient and uses no browser routes or history. A backdrop blocks pointer interaction with the camera/performance screen; keyboard focus wraps inside the open dialog. Escape and the existing D shortcut close it. The performance toolbar still exposes Start/Stop camera and Settings.

## Control map

| Page | Existing controls retained |
| --- | --- |
| Instrument | Key/tonic, starting octave, scale/mode, sound, one-shot/gate note behavior, Attack, Decay, Sustain **level**, Release, sound-envelope defaults, and one-shot sound preview. |
| Effects | Reverb on/amount, delay on/amount, echo spacing, tempo, and tap tempo. The percent number inputs remain available for effects amounts above the slider's displayed range. |
| Camera & Display | Front/rear camera, key strip height and position, and live key percentages. The strip controls remain the same normalized geometry settings. |
| Detection | Pixel sensitivity, step sensitivity, maximum self-calibration activity, cooldown, manual empty-floor calibration, and the existing 30% sensitivity shortcut when relevant. An Advanced disclosure contains pixel sample step and the temporary detector telemetry toggle. |
| Root | Reset all settings to defaults. |

No useful exposed control was removed. Manual calibration remains a large button inside Detection; it still uses the existing capture lifecycle and preserves step sensitivity. The common performance view is unchanged apart from a 44 px minimum toolbar button height on narrow screens. No calibration, trigger, or audio policy was changed.

## UI structure and future reuse

`src/settings-navigation.js` owns the small root/category state machine and rejects invalid transitions. `src/app.js` maps that state to the visible page, heading, back button, focus, and scroll position. Existing input handlers and element IDs continue to update the same settings; the two note-mode choices now use a native radio group with a reusable segmented visual treatment. The Settings markup uses repeated labeled control rows, grouped headings, toggle rows, range rows, and a dedicated `instrument-controls` group. These CSS/HTML patterns can be adapted for a future keyboard-module inspector without adding a component framework.

The panel fills the viewport width on a narrow phone and stays a right-hand sheet on desktop. Its heading remains visible while the content scrolls. Buttons, selects, radio segments, range input hit areas, and effect number inputs have touch-sized targets. The Advanced area keeps developer diagnostics secondary. Labels, fieldset/legend, headings, dialog semantics, visible focus, and focus return support keyboard and assistive access.

## Persistence and architecture boundary

The existing localStorage keys and record shapes are unchanged: `dance-keys-settings-v2`, `dance-keys-music-v1`, `dance-keys-show-percentages`, and `dance-keys-camera-v1`. Existing loading/normalization and old music-record compatibility remain in place. The Settings page and Advanced disclosure are UI-only state; detector telemetry still is not saved. Instrument controls still edit the current shared music settings for the sole default keyboard. They were **not** migrated into layout or module persistence. Camera/display, detector defaults, and effects remain app-level concerns.

## Verification

`npm test` passes **72 tests** (70 existing and 2 navigation-state tests). The detector and audio tests were left unchanged and pass. `node --check src/app.js` and `git diff --check` pass.

In the local browser preview, the root and all four pages were opened. Back, Close, reopen-at-root, and focus wrap were checked. Instrument mode/Attack edits, effects toggle/amount/tempo, camera selection/strip height/percentages, detection sensitivity/sample step/telemetry, and manual-calibration feedback without a running camera were exercised. Gate mode and Attack persisted across reload. The sound preview played through its existing one-shot path. The preview settings were reset afterward. The panel was inspected at the browser's desktop size, 360 × 740 and 320 × 640 portrait overrides, and 740 × 360 landscape override; vertical scrolling worked and measured page/panel widths did not exceed the viewport. The browser console reported no errors. Temporary viewport overrides were cleared.

These are browser checks, not real-phone or live-camera acceptance. A physical pass should confirm touch dragging on ranges, camera switching during playback, and calibration visibility on a device with camera permission.

## Files and next boundary

Changed: `index.html`, `styles.css`, `src/app.js`, `src/settings-navigation.js`, `test/settings-navigation.test.js`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and this report.

Future module/customization work can reuse the Instrument control grouping and labeled input patterns, but will need an explicit selected-module data binding and versioned layout persistence. Phase 4 adds neither. A later editor should also decide whether manual calibration needs a separate performance-screen shortcut after real-device use; this phase keeps it in Detection.
