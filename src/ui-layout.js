function overlap(startA, endA, startB, endB) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}

export function shouldDockPerformanceActions({ stripTop, stripBottom, topControlsBottom, bottomControlsTop }) {
  const topOverlap = overlap(stripTop, stripBottom, 0, topControlsBottom)
  const bottomOverlap = overlap(stripTop, stripBottom, bottomControlsTop, Infinity)
  return topOverlap > 0 && bottomOverlap < topOverlap
}
