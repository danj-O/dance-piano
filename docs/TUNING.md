# Tuning Guide

Use dev mode to dial in settings for your room, camera, and floor. The goal is: **keys fire reliably when you step, and stay silent when you don't.**

Open dev mode with **D** or the **Dev Mode** button.

## Recommended workflow

### 1. Set the detection zone

Adjust **Key zone height** and **Key zone position** until the yellow box (and key bars) cover the area where your feet actually land when you play.

- **Height** — how tall the strip is (too small = missed steps, too large = false triggers from upper body)
- **Position** — 0 = top of screen, 1 = bottom; moves the whole strip up or down

The key bars and detection zone are the same thing — both sliders affect both together.

### 2. Find your baseline motion counts

Stand still and watch the numbers on each key. They should stay low (often 0–20 depending on lighting and camera noise).

If idle counts are already high (50+):

- Raise **Pixel threshold** until idle noise drops.
- Improve lighting, reduce shadows, or simplify the floor background.

### 3. Calibrate the trigger threshold

Step firmly on one key at a time. Note the motion count when the note fires reliably.

| What you see | Fix |
|--------------|-----|
| Count reaches trigger but no note | Check cooldown isn't blocking; verify you clicked START |
| Note fires on idle / background | Raise **Motion trigger** or **Pixel threshold** |
| Stepping hard but count stays low | Lower **Pixel threshold** or widen **Detection zone height** |
| Count spikes but note is inconsistent | Lower **Motion trigger** slightly |
| Same key fires repeatedly on one step | Raise **Cooldown** |

A good target: stepping gives counts **well above** `motionTrigger`, idle counts stay **well below** half of it. That gap is your safety margin.

### 4. Balance sensitivity vs performance

**Pixel sample step** trades accuracy for speed:

| Step | Effect |
|------|--------|
| 1 | Most accurate, highest CPU |
| 2 | Good default |
| 3–4 | Faster, but max motion counts drop — lower **Motion trigger** accordingly |

If the app feels sluggish, try step 3 and re-tune motion trigger.

### 5. Lock in your settings

When happy:

1. Click **Copy settings JSON**.
2. Open `sketch.js`.
3. Replace the values in the `settings` object at the top with your copied values.

Example:

```javascript
const settings = {
  threshold: 12,
  cooldown: 300,
  motionTrigger: 90,
  keyZoneHeight: 0.18,
  keyZonePosition: 1,
  noteLabelSize: 16,
  pixelStep: 2,
  noteDuration: "8n",
  showDetectionZone: true,
  showMotionCounts: true,
}
```

You can set `showDetectionZone` and `showMotionCounts` to `false` for performance/cleanliness in "production" use.

## Environment checklist

These matter as much as the sliders:

- **Camera angle** — point down at the floor; feet should fill a good portion of the detection zone width when stepping.
- **Lighting** — even, bright light reduces noise. Avoid strong shadows moving across the floor.
- **Floor** — plain surfaces work best. Busy patterns create constant micro-motion.
- **Distance** — if you're too far, feet are small and motion counts stay low.

## Reading the on-screen indicators

| Color | Meaning |
|-------|---------|
| White (faint) | Idle — motion below ~50% of trigger |
| Orange | Warm — motion above 50% of trigger but not fired yet |
| Green | Triggered — note played this frame |
| Yellow box | Key zone boundary — same as the key bars (dev mode only) |
| Number on key | Live moving-pixel count for that zone |

## Starting points by problem

**Too sensitive (ghost notes)**

```
↑ threshold (+5 to +15)
↑ motionTrigger (+20 to +50)
↑ cooldown (+50 to +100)
```

**Not sensitive enough (missed steps)**

```
↓ threshold (-2 to -5)
↓ motionTrigger (-10 to -30)
↑ keyZoneHeight (+0.02 to +0.05)
```

**Notes double-fire on one step**

```
↑ cooldown (+50 to +150)
↑ motionTrigger slightly
```

**Works in one spot but not others**

```
↑ keyZoneHeight
Check camera FOV — you may be stepping outside the frame edges
```

## Defaults reference

These are the reset values in dev mode (reasonable starting point, not universal):

| Setting | Default | Typical range |
|---------|---------|---------------|
| Pixel threshold | 8 | 5–25 |
| Motion trigger | 75 | 40–200 |
| Cooldown (ms) | 250 | 150–500 |
| Key zone height | 0.15 | 0.10–0.25 |
| Key zone position | 1 | 0.7–1.0 (bottom) or lower if feet are higher in frame |
| Pixel sample step | 2 | 1–3 |

Your room will differ — treat defaults as a starting guess, not a target.
