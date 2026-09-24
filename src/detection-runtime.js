import { ZoneTracker } from './detector.js'
import { LocalAdaptation } from './local-adaptation.js'
import { GlobalIdleCalibration } from './global-idle-calibration.js'

// Owns the temporal controllers for one camera reference and one zone set.
// The app still dispatches trigger events before asking for baseline updates.
export class DetectionRuntime {
  constructor(zones) {
    this.zones = zones
    this.reset()
  }

  reset() {
    this.tracker = new ZoneTracker(this.zones)
    this.local = new LocalAdaptation(this.zones)
    this.global = new GlobalIdleCalibration(this.zones)
  }

  updateCalibration(measurements, now, settings) {
    const global = this.global.update(measurements, this.tracker, now, settings)
    if (global.resetLocal) this.local = new LocalAdaptation(this.zones)
    if (global.completed) {
      this.tracker = new ZoneTracker(this.zones)
      this.local = new LocalAdaptation(this.zones)
    }
    if (global.suspendLocal || global.completed) return global.alphaByZone
    return this.local.update(measurements, this.tracker, now, settings)
  }
}
