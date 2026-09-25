# Phase 6A Results — Customize Mode editor foundation

## Scope and session behavior

The performance toolbar now has **Customize Layout**. The editor keeps the camera preview visible, highlights modules, and offers Cancel and Done. It edits the keyboard as one module and each trigger as one module. The sixteen generated keyboard zones remain children of the keyboard; no key can be positioned independently.

The classic page still loads the familiar single keyboard. Entering Customize from that page seeds a temporary three-module draft with the current keyboard plus the Phase 5 kick and snare. Cancel discards that draft and leaves the classic runtime layout untouched. Done accepts the draft, including any edited transforms, for the current page session. Reloading the classic URL returns to the classic keyboard; the development `?layout=percussion-demo` URL still starts with all three modules. No layout is written to localStorage, and the existing four storage keys/formats are unchanged. Existing app-level music settings continue to configure the keyboard. The legacy strip height/position controls can still adjust a session keyboard, provided the proposed rectangle does not overlap another module.

## Editor architecture and interaction

`src/editor.js` owns a cloned entry snapshot, a mutable valid draft, one selected module ID, and one pointer gesture at a time. Pointer down first checks the selected module's two corner handles, then tests whole module rectangles. A 44 px minimum hit band makes the classic near-line keyboard selectable. The handles have a 44 px hit diameter. Tapping empty camera space deselects. Dragging preserves the pointer offset from the module so the rectangle does not jump.

The canvas and pointer handlers use the same aspect-fit `videoRect()` as performance rendering. Pointer coordinates are converted from the canvas's CSS box into canvas coordinates. `displayRect()` maps normalized, unmirrored camera rectangles to the mirrored screen. Moving right on screen therefore decreases camera `x`; resizing manipulates a screen rectangle and converts it back to canonical camera coordinates. Resize supports the north-west and south-east corners, changing width and height without rotation. Pointer gestures are cancelled on viewport resize to avoid mixing two coordinate scales. Geometry itself stays normalized, so orientation and viewport changes only affect display.

Drag clamps each rectangle inside camera bounds. Resize enforces minimum dimensions (triggers: 6% of frame in each dimension; keyboard width: 16%, while an existing thinner keyboard height can remain as thin as it was on entry). Every candidate is checked with the existing `generateZones()` validation. An overlapping candidate appears as a red preview while the last valid draft rectangle stays in place. Releasing during overlap keeps that last valid rectangle and shows a status message. Edge contact without area overlap is allowed. This does not add overlapping baseline support.

The editor renderer shows whole module outlines, a selected outline and handles, and faint generated key divisions for orientation. The divisions are display-only; pointer hit testing uses module rectangles. The camera or a placeholder is drawn beneath the editor overlay. The toolbar and large controls stay accessible in portrait and landscape; the instruction card is hidden at short heights to leave trigger space clear. The canvas uses `touch-action: none` during editing and the page prevents scrolling.

## Runtime handoff and calibration

While Customize is open, the camera frame callback continues rendering but skips frame measurement, `ZoneTracker`, adaptation, and action dispatch. Entering calls `allNotesOff()` so held gate voices cannot ring through an edit. The performance layout and runtime zones are not mutated while the draft changes.

Done validates the draft again, regenerates zones with stable module/zone IDs and preserved note/drum actions, constructs a fresh `DetectionRuntime`, and clears measurements. If the accepted layout differs from the previous performance layout, it discards the shared camera baseline and uses the existing one-second startup-reference delay before measuring again. This prevents newly moved zones from inheriting stale occupancy, local adaptation, or global idle state. If geometry is unchanged, the baseline is kept but temporal detector state still resets. Cancel discards the draft, keeps the original performance layout and baseline, and resets temporal state after the pause. If either exit occurs before the camera reference exists, capture is rescheduled from that exit.

The Customize control is unavailable while a camera start/switch or manual calibration is in progress. Editing can start with the camera off; a placeholder shows the camera region. Settings and camera switching are not accessible inside Customize. If the camera disconnects, editing is cancelled and the normal stopped-camera screen returns.

## Verification

`npm test` passes **95 tests** (the previous 88 plus seven editor tests). The new tests cover whole-module selection/deselection, thin-keyboard hit testing, mirrored and viewport-scaled coordinate conversion, drag alignment and bounds, two-corner resizing and minimum dimensions, keyboard zone regeneration and note ordering, trigger action retention, overlap rejection for drag and resize, Cancel snapshots, Done session geometry, and fresh detector state. `node --check src/app.js`, `node --check src/editor.js`, and `git diff --check` pass.

In the localhost browser, the desktop editor was entered from the classic page. Keyboard and trigger selection, dragging and resizing, a trigger overlap attempt, Cancel/re-enter restoration, and Done/re-enter session geometry were checked visually. At 360 × 740 portrait, drag and resize worked, Done/Cancel remained visible, and document width equalled viewport width. At 320 × 640 portrait, the performance entry and editor controls fit without horizontal overflow. At 740 × 360 landscape, module selection and resize worked, the compact toolbar remained visible, the instruction card no longer covered the trigger, and there was no horizontal or vertical document overflow. The legacy strip-height control was exercised after Done; the session keyboard geometry updated and the control was reset afterward. The browser console showed no errors. Temporary viewport overrides were reset. These are browser mouse interactions at mobile viewport sizes, not physical touch tests.

The local browser's camera request remained pending, so live video alignment, actual silence during editing, and resumed physical triggering after Done/Cancel could not be observed there. The frame-loop guard and runtime handoff were inspected in source and covered at the editor/runtime boundary, but a camera-capable device should verify them physically.

## Files changed and next boundary

Changed: `index.html`, `styles.css`, `src/app.js`, `src/editor.js`, `test/editor.test.js`, `README.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/ROADMAP.md`, and this report.

Phase 6B should bind module-specific settings to the selected module and add the requested module operations without letting global Settings silently overwrite individual module configuration. Phase 6C should add a versioned, validated layout record and a clear reset path. Neither is implemented here.
