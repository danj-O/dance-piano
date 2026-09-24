import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldDockPerformanceActions } from '../src/ui-layout.js'

test('moves controls away from a key strip at the top of a phone screen', () => {
  assert.equal(shouldDockPerformanceActions({ stripTop: 95, stripBottom: 120, topControlsBottom: 115, bottomControlsTop: 750 }), true)
})

test('leaves controls at the top when the key strip is near the bottom', () => {
  assert.equal(shouldDockPerformanceActions({ stripTop: 750, stripBottom: 780, topControlsBottom: 115, bottomControlsTop: 750 }), false)
})

test('chooses the edge that covers less of a tall key strip', () => {
  assert.equal(shouldDockPerformanceActions({ stripTop: 50, stripBottom: 830, topControlsBottom: 115, bottomControlsTop: 750 }), false)
})
