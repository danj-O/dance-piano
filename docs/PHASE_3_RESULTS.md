# Phase 3 Results — Audio interaction model

## Status and boundary

The default Dance Piano keyboard remains **one-shot**, preserving the familiar short-note feel. Settings can switch it to **Gate — sustain while held** for physical testing. The Phase 2 detector and calibration files were not changed: `ZoneTracker` still emits the same generic `trigger` and `release` events, including its established cooldown, broad-change guard, and two-frame rearm behavior. Gate playback depends on those existing release events.

The path is: zone event → note action in `src/actions.js` → `DanceAudio.trigger` or `noteOn`/`noteOff` → voice envelope → existing dry, reverb, delay, compressor, and output graph. The detector does not know notes or envelope modes.

## Note actions and lifecycle

Each generated note action contains its pitch, `oneShot`/`gate` mode, sound, and optional envelope. The default keyboard gets these values from the existing music settings. `createDefaultLayout` stores them in its keyboard module configuration and `generateZones` copies them to zone actions, so another future keyboard module can override its sound/envelope without changing the detector or audio API. There is still only one built-in keyboard and no editable module UI.

| Mode | Trigger | While held | Release |
| --- | --- | --- | --- |
| `oneShot` (default) | Creates a finite voice and schedules its complete envelope. | Voice follows its short scheduled hold and release independently of occupancy. | Ignored musically. |
| `gate` | Creates a voice with `noteOn(note, {voiceId, sound, envelope})`. | Voice stays at its sustain **level** after decay, with no scheduled oscillator stop. | `noteOff(voiceId)` releases that voice and schedules oscillator cleanup. |

`voiceId` is the zone ID, not the note name. Different zones mapped to the same pitch own separate voices. Several gated notes can sound at once; releasing one does not change another. A repeated `noteOn` from the same zone releases its old voice and starts a new voice, allowing a brief overlap. If a zone retriggers while its prior voice is releasing, the new voice becomes the current owner. Old oscillator callbacks only remove a map entry if it still points to that exact voice. A second `noteOff` with no active owner is a no-op.

## ADSR and defaults

Attack rises from a tiny nonzero floor to peak gain; decay moves to `peak × sustain`; sustain is a level held by gated voices, not a duration; release exponentially approaches the floor before oscillators stop. On `noteOff`, the current attack/decay/sustain level is computed from the original envelope and used as the release start, avoiding a sudden jump when a key is released before decay finishes. Zero attack/decay values take the target level immediately. The floor is `0.0001`, peak voice gain is `0.18`, and oscillators stop 30 ms after the envelope reaches the floor.

The existing sound-specific amplitude character remains the starting point. The values below are centralized in `SOUND_ENVELOPES` in `src/music.js`; the existing internal one-shot post-decay holds remain in `src/audio.js`.

| Sound | Attack | Decay | Sustain level | Release | One-shot hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| Soft keys (default) | 0.008 s | 0.16 s | 25% | 0.42 s | 0.12 s |
| Bell | 0.004 s | 0.50 s | 8% | 0.90 s | 0.03 s |
| Pluck | 0.004 s | 0.12 s | 12% | 0.28 s | 0.04 s |
| Bright synth | 0.012 s | 0.18 s | 42% | 0.34 s | 0.15 s |
| Organ | 0.020 s | 0.06 s | 80% | 0.30 s | 0.22 s |

The Settings ranges are attack 0–1.5 s, decay 0–3 s, sustain 0–100%, and release 0.02–5 s. These are musical controls, not Web Audio node controls. `Use sound defaults` clears a custom envelope. Editing ADSR changes only newly created voices; an active voice keeps the envelope it started with. Changing key, scale, octave, sound, or note mode sends all-notes-off before replacing note actions, preventing a held gate from outliving its mapping. Changing effects or tempo does not interrupt held notes; the existing effect sends and delay time continue updating through `setSettings`.

## Cleanup and reset

The audio engine tracks every live voice in a `Set` and current gated owners in a `Map`. Each oscillator has an `onended` callback. After all partials of a voice end, oscillators, partial gains, and the voice gain disconnect, and both collections drop the voice. One-shot oscillators are scheduled to stop at creation. Gated oscillators are scheduled to stop on `noteOff`. `allNotesOff()` gives remaining voices a short 20 ms release and clears gate ownership; `stop()` immediately stops and disconnects every remaining voice before closing the context.

The app invokes all-notes-off when the camera is released or switched, manual calibration starts, the detection zone geometry or sample step resets, note mapping/behavior changes, or default settings are restored. These paths can reset detector state without an ordinary zone release event. The existing effects graph, presets, and output compressor are retained.

## Persistence and UI

The existing `dance-keys-music-v1` localStorage record gains additive `noteMode` and `envelope` fields; its key and older fields remain unchanged. Older records without those fields load as one-shot with the selected sound's original envelope. `envelope: null` means use the current sound's defaults; a customized envelope is stored as four validated numbers. Invalid modes fall back to one-shot, and invalid/out-of-range envelope values use or clamp to safe defaults. No layout data is persisted.

Settings adds one note-behavior selector, four ADSR sliders, a clear Sustain-level label, and a button to restore the sound's default envelope. The existing Preview sound button always triggers a finite one-shot so it can be used without a camera or held key. Phase 4 can group these controls and expose module-specific sound configuration; Phase 3 does not redesign Settings.

## Files and verification

- `src/music.js`: note modes, per-sound envelope defaults, validation, and additive saved settings.
- `src/layout.js`: module-level note config copied into generated zone actions.
- `src/actions.js`: routes unchanged zone events according to one-shot/gate mode.
- `src/audio.js`: explicit voice lifecycle, ADSR automation, polyphony, retrigger policy, cleanup, and all-notes-off.
- `src/app.js`, `index.html`: minimal Settings controls, preview behavior, audio reset calls, and script cache refresh.
- `test/actions.test.js`, `test/audio.test.js`, `test/music.test.js`, `test/layout.test.js`: action routing, mocked Web Audio schedules/cleanup, saved-settings compatibility, and module override coverage.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, this report: current architecture and phase boundary.

`npm test` passes **70 tests**, including all unchanged Phase 2 detector/calibration tests. Mock Web Audio tests cover finite one-shot cleanup, attack/decay/sustain/release scheduling, simultaneous and duplicate-note gates, release isolation, retrigger while active and releasing, all-notes-off, effect-send updates, and old/new settings. A localhost browser smoke check showed the controls, played one-shot Preview sound without console errors, and verified that gate mode and an edited attack value survive reload. The test browser's settings were then reset to defaults. `node --check src/app.js` and `git diff --check` pass.

## Known limits and physical checks

Actual speaker timing, clicks, and perceived loudness still need a real device check. In gate mode, hold several keys, release one while others remain held, retrigger a key quickly, and release during attack and decay. Repeat with each sound, reverb/delay on and off, and long release. Verify no lingering note after camera stop/switch, manual calibration, geometry/sample-step change, mode change, and Reset defaults. One-shot should still feel close to the prior instrument. The detector's two-frame release remains FPS-dependent by design, so gate note-off timing follows that established interaction rule.

For Phase 4, group note behavior and ADSR under a clearer instrument section, distinguish global defaults from future module overrides, and make the growing Settings panel easier to navigate on mobile. Do not expand audio behavior as part of that UI work without a separate request.
