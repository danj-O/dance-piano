# Tuning Dance Keys

1. Aim the camera down at a floor with steady lighting. Keep the camera still and the key strip empty during the one-second startup reference capture.
   On a phone, the front camera is the default so you can see the screen. Choose **Settings → Camera → Rear camera** if that placement works better. You can switch while playing; clear the strip while the new camera captures its floor reference.
2. Start the app and open **Settings**. Adjust **Key strip height** and **Key strip position** until the outlined area covers where your feet land.
   The height can be as low as 0.5%, nearly a line. Note labels move outside the strip when it is thin.
3. Move completely out of that area, then click the large **Calibrate empty floor** button at the top of Settings. Keep the strip clear for 2.5 seconds until the new floor reference is captured and the progress bar disappears. Recalibration does not change Step sensitivity. New and reset settings use 30%; if this browser has an older saved value, use the nearby **Use 30% step sensitivity** button once if you want that value.
4. Step into one key at a time. One note should play on entry. Holding still should keep the key yellow; stepping out should clear it silently. Turn on **Show key percentages** if you want live occupancy numbers while testing. The switch is saved in this browser.
5. Close Settings to play. Changes are saved automatically in the browser.

| Symptom | Try |
| --- | --- |
| Notes play while no one is stepping | Raise **Pixel sensitivity** or **Step sensitivity**; reduce shadows or camera shake. |
| A light step is missed | Lower **Step sensitivity**, then **Pixel sensitivity** if necessary. |
| Very thin strip misses steps | Increase its height slightly, or set **Pixel sample step** to 1. The 0.5% strip samples only about one or two camera rows. |
| A step plays a neighboring key too | Move the camera closer or reduce strip height so the foot occupies fewer zones. |
| The key stays active after the foot leaves | Clear the strip and recalibrate. Check for a strong moving shadow or a shifted camera. |
| A foot is held still but the key retriggers | Clear the strip and recalibrate; the occupied area should stay above the release threshold until the foot leaves. |
| App feels slow | Raise **Pixel sample step**. Occupancy is measured as a percentage, so the step threshold should remain broadly comparable. |
| No camera picture | Check camera permission and that the page is on localhost or HTTPS; close other apps using the camera. |

Green fill means a note just played. Yellow fill means the key remains occupied after that flash. White is idle; amber and cyan bars show local recalibration progress. Numeric percentages appear while **Show key percentages** is on. **Reset defaults** restores the initial settings, including 30% Step sensitivity, the front camera, and display switch; **Stop camera** releases the device.

This detector compares the view with a clear-floor image; it does not identify feet. Shadows, pets, or other objects in the strip can trigger notes. Calibrate again when lighting or camera placement changes.

## Music and effects

Choose **Key**, **Scale or mode**, and **Starting octave** to place the sixteen notes. The screen runs low on the left to high on the right. **Sound** changes the synth recipe; press **Preview sound** to hear a middle note without starting the camera.

Reverb and delay each have an on/off switch and amount slider. The sliders reach 200%; enter a higher nonnegative percentage in the field beside either slider if needed. The audio send tapers as values rise. For tempo-synced echoes, turn on **Delay**, choose an **Echo spacing**, then set **Tempo** or tap **Tap tempo** at least twice. A new tap sequence starts after a pause. If echoes overlap too much, lower **Delay amount** or select a faster echo spacing.
