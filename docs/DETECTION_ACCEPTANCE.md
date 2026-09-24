# Detection acceptance — real-camera checklist

Use a real camera, a clear strip, and the normal default settings first. Turn on **Show detector telemetry** and **Show key percentages** during diagnosis. Record the device, browser, camera, strip height, sample step, and any changed thresholds. Mark each case **pass/fail** and note the observed ratios and state labels. Restore the default settings before a second run if tuning was needed.

| Case | Action | Pass condition | Result |
| --- | --- | --- | --- |
| Reference | Start with the strip empty; wait for the first reference. | Keys settle near 0%; no note fires during capture. | ☐ Pass ☐ Fail |
| Several keys | Step on separated keys one at a time. | Each entry plays its matching note once; the just-played key flashes green. | ☐ Pass ☐ Fail |
| Hold | Keep a foot on one key for 10 seconds. | No repeated note; key remains occupied; its baseline does not absorb the foot. | ☐ Pass ☐ Fail |
| Leave/re-enter | Leave fully, then step on the same key again. | The key releases/rearms and a new entry plays once. | ☐ Pass ☐ Fail |
| Repeated notes | Repeat entries at different speeds. | Cooldown limits rapid repeats without preventing ordinary repeats. | ☐ Pass ☐ Fail |
| Neighbors | Step near the boundary between two keys. | Only zones actually occupied react; note and overlay match the visible position. | ☐ Pass ☐ Fail |
| Broad change | Cover or illuminate at least half the strip at once. | Broad-change guard suppresses an accidental chord; active zones do not self-calibrate. | ☐ Pass ☐ Fail |
| Local low drift | Make a small background or camera change affecting one/few keys while keeping readings below the effective self-calibration limit. | Affected keys show local drift/recovery and move toward normal; unrelated keys remain stable. | ☐ Pass ☐ Fail |
| Flicker and slow drift | Create low residual variation and then a gradual lighting change. | Stable low drift can recover; unstable spikes interrupt or delay adaptation. Note any zone stuck indefinitely. | ☐ Pass ☐ Fail |
| Light switch | Switch a room light on/off with the strip clear. | Low safe changes can recover; large changes above the limit block and call for manual calibration. No obvious occupancy is learned. | ☐ Pass ☐ Fail |
| Broad shadow | Cast and remove a shadow across the strip. | Sudden/unstable shadow blocks global refresh; any note is reported as a false trigger. | ☐ Pass ☐ Fail |
| Stationary foot | Hold a foot at a high ratio for at least 30 seconds. | `ACTIVE`/`OCCUPIED` persists; no local/global blend of that zone; ratio does not decay toward zero. | ☐ Pass ☐ Fail |
| Stationary object | Place a hand or object in one zone for at least 30 seconds. | Obvious occupancy blocks calibration even when it becomes motionless. | ☐ Pass ☐ Fail |
| Slow entry | Move gradually into a key, then pause. | Entry triggers when threshold is reached; higher occupied signal is not learned into the baseline. | ☐ Pass ☐ Fail |
| Post-interaction | Trigger and release a key while another low drift is present. | Local `FROZEN` lasts through its grace period; global reports recent interaction before reconsidering. | ☐ Pass ☐ Fail |
| Global low drift | With the strip empty, cause a **small, broad** change that leaves at least half the keys in a stable low band below the global ceiling. | `GLOBAL: IDLE` → `VERIFYING` → `REFRESHING`; purple line appears only while telemetry is on; ratios tend toward normal; no repeated cycle. | ☐ Pass ☐ Fail |
| Global with occupancy | Repeat the low broad change with one obvious occupied key. | Global reports `BLOCKED — ACTIVE ZONE` or `HIGH OCCUPANCY`; no global refresh or occupancy decay. | ☐ Pass ☐ Fail |
| Global interruption | Step in during idle, verification, and refresh on separate runs. | Each run cancels promptly; refresh does not continue blending after the step. | ☐ Pass ☐ Fail |
| Large camera shift | Move the camera enough that many keys read above the step/occupancy threshold. | Global remains blocked and explains why. Clear the strip and use **Calibrate empty floor**; playing resumes on the new view. This is the intended safety fallback. | ☐ Pass ☐ Fail |
| Manual reference | Press **Calibrate empty floor** with the strip clear. | Progress ends after a new frame is captured; ratios and temporal states reset; Step sensitivity is unchanged. | ☐ Pass ☐ Fail |
| Camera switch | Switch front/rear camera, keeping the strip clear. | New camera captures a fresh reference; no stale drift or cooldown state remains. | ☐ Pass ☐ Fail |
| Stop/start | Stop and restart the camera. | New reference and temporal state; no stale key or calibration state. | ☐ Pass ☐ Fail |
| Reset settings | Change detection settings, then reset defaults. | Defaults return, including 30% Step sensitivity and 12% maximum self-calibration activity; no stale candidate state. | ☐ Pass ☐ Fail |
| Thin strip | Repeat playing, low drift, and occupancy tests at the default 0.5% strip height. | Note any 10-point jumps or missed samples; high occupancy still blocks adaptation. | ☐ Pass ☐ Fail |
| Taller strip | Repeat at a taller strip height and, if practical, a different sample step. | Compare stability and responsiveness with the thin strip; record whether global eligibility changes. | ☐ Pass ☐ Fail |

If a case fails, record the raw percentage range, key/local/global states, settings, approximate frame rate, and whether a manual reference restores operation. A large camera move being blocked is **not** a failure; a stationary occupied zone being learned into the baseline is.
