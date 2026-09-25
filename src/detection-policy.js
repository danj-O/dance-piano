// Detector policy, kept separate from UI and musical action settings.
// These values preserve the Phase 2A–2C behavior; Phase 2D does not retune them.
export const FRAME_WIDTH = 320
export const FRAME_HEIGHT = 240
export const FRAME_FALLBACK_INTERVAL_MS = 50
export const TELEMETRY_PAINT_INTERVAL_MS = 250

export const DEFAULT_SETTINGS = Object.freeze({
  pixelThreshold: 50,
  pressThreshold: 0.30,
  adaptationCeiling: 0.12,
  cooldownMs: 300,
  zoneHeight: 0.005,
  zonePosition: 0.94,
  pixelStep: 2,
})

export const SETTINGS_LIMITS = Object.freeze({
  pixelThreshold: [10, 150],
  pressThreshold: [0.04, 0.6],
  adaptationCeiling: [0.02, 0.45],
  cooldownMs: [100, 800],
  zoneHeight: [0.005, 0.45],
  zonePosition: [0, 1],
  pixelStep: [1, 5],
})

export const TRIGGER_POLICY = Object.freeze({
  releaseFraction: 0.35,
  rearmQuietFrames: 2,
  broadChangeFraction: 0.5,
  minimumBroadZones: 4,
})

export const TELEMETRY_POLICY = Object.freeze({
  historyWindowMs: 10_000,
  historyIntervalMs: 100,
  historyLimit: 120,
})

export const LOCAL_ADAPTATION = Object.freeze({
  noiseCeiling: 0.02,
  noisePressFraction: 0.2,
  maximumActivity: 0.45,
  maximumPressFraction: 0.75,
  stabilityWindowMs: 2000,
  minimumStableSpanMs: 1500,
  minimumStableRange: 0.06,
  maximumStableRange: 0.2,
  stableRangeFraction: 0.7,
  minimumActiveFraction: 0.65,
  normalDwellMs: 600,
  candidateDwellMs: 4000,
  postInteractionGraceMs: 3000,
  sharpRiseMinimum: 0.06,
  sharpRiseMaximum: 0.12,
  sharpRiseRangeFraction: 0.5,
  sharpRiseHoldMs: 2000,
  baselineTimeConstantMs: 2500,
  maximumBlendIntervalMs: 100,
  completionDwellMs: 600,
  completionFlashMs: 900,
  minimumActivityMargin: 0.001,
})

export const GLOBAL_IDLE_CALIBRATION = Object.freeze({
  historyWindowMs: 2000,
  minimumHistorySpanMs: 1500,
  idleDwellMs: 5000,
  verificationDwellMs: 4000,
  interactionQuietMs: 5000,
  suspiciousQuietMs: 2000,
  driftZoneFraction: 0.5,
  minimumDriftZones: 2,
  maximumPressFraction: 0.5,
  maximumStableRange: 0.06,
  stableRangeFraction: 0.5,
  minimumStableRange: 0.03,
  refreshTimeConstantMs: 800,
  refreshDurationMs: 2500,
  maximumBlendIntervalMs: 100,
  postRefreshCooldownMs: 20_000,
  clearDwellMs: 2000,
})

export const REFERENCE_POLICY = Object.freeze({
  startupCaptureDelayMs: 1000,
  manualCaptureDelayMs: 2500,
  manualCaptureTimeoutMs: 5000,
  manualProgressIntervalMs: 100,
})
