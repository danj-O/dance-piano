# Tuning Dance Keys

1. Aim the camera down at a floor with steady lighting. Keep the camera still.
2. Start the app and open **Settings**. Adjust **Key strip height** and **Key strip position** until the outlined area covers where your feet land.
3. Move completely out of that area, then click **Calibrate idle noise**. Stay clear for two seconds.
4. Step into one key at a time. The live percentage on that key should rise above **Step sensitivity**, and one note should play.
5. Close Settings to play. Changes are saved automatically in the browser.

| Symptom | Try |
| --- | --- |
| Notes play while no one is stepping | Raise **Pixel sensitivity** or **Step sensitivity**; reduce shadows or camera shake. |
| A light step is missed | Lower **Step sensitivity**, then **Pixel sensitivity** if necessary. |
| A step plays a neighboring key too | Move the camera closer or reduce strip height so the foot occupies fewer zones. |
| One long movement plays the same note twice | Raise **Cooldown**. The key also rearms after two quiet video frames. |
| App feels slow | Raise **Pixel sample step**. Motion is measured as a percentage, so the step threshold should remain broadly comparable. |
| No camera picture | Check camera permission and that the page is on localhost or HTTPS; close other apps using the camera. |

The green flash means a note played. Orange means motion has reached half the step threshold. White is idle. The numeric percentage is shown while Settings is open. **Reset defaults** restores the initial settings, and **Stop camera** releases the device.

This detector observes changed pixels, not feet. Moving shadows, pets, or other motion in the strip can trigger notes. Calibrate again when lighting or camera placement changes.
