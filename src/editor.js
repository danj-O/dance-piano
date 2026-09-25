import { displayRect } from './display-geometry.js'
import { generateZones } from './layout.js'

export const EDITOR_HIT_SIZE = 44
export const EDITOR_HANDLE_SIZE = 44
const MIN_SIZE = {
  keyboard: { width: 0.16, height: 0.035 },
  trigger: { width: 0.06, height: 0.06 },
}

export const cloneLayout = (layout) => JSON.parse(JSON.stringify(layout))
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function cameraPoint(point, view) {
  return { x: 1 - (point.x - view.x) / view.w, y: (point.y - view.y) / view.h }
}

export function moduleAt(layout, point, view) {
  if (point.x < view.x || point.x > view.x + view.w || point.y < view.y || point.y > view.y + view.h) return null
  for (const module of [...layout.modules].reverse()) {
    const box = displayRect(module.transform, view)
    const padX = Math.max(0, (EDITOR_HIT_SIZE - box.w) / 2)
    const padY = Math.max(0, (EDITOR_HIT_SIZE - box.h) / 2)
    if (point.x >= box.x - padX && point.x <= box.x + box.w + padX
        && point.y >= box.y - padY && point.y <= box.y + box.h + padY) return module.id
  }
  return null
}

export function handleAt(transform, point, view) {
  const box = displayRect(transform, view)
  const distance = (x, y) => Math.hypot(point.x - x, point.y - y)
  const nw = distance(box.x, box.y)
  const se = distance(box.x + box.w, box.y + box.h)
  const radius = EDITOR_HANDLE_SIZE / 2
  if (nw <= radius && nw <= se) return 'nw'
  if (se <= radius) return 'se'
  return null
}

export function dragTransform(transform, start, point, view) {
  const from = cameraPoint(start, view)
  const to = cameraPoint(point, view)
  const x = clamp(transform.x + to.x - from.x, 0, 1 - transform.width)
  const y = clamp(transform.y + to.y - from.y, 0, 1 - transform.height)
  return { ...transform, x, y }
}

export function resizeTransform(transform, corner, start, point, view, type) {
  const configuredMinimum = MIN_SIZE[type]
  if (!configuredMinimum) throw new RangeError(`Unknown module type: ${type}`)
  // The classic keyboard can begin as an intentionally near-line strip.
  const minimum = {
    width: Math.min(configuredMinimum.width, transform.width),
    height: Math.min(configuredMinimum.height, transform.height),
  }
  const startBox = displayRect(transform, view)
  const dx = point.x - start.x
  const dy = point.y - start.y
  let left = startBox.x
  let top = startBox.y
  let right = startBox.x + startBox.w
  let bottom = startBox.y + startBox.h
  if (corner === 'nw') {
    left = clamp(left + dx, view.x, right - minimum.width * view.w)
    top = clamp(top + dy, view.y, bottom - minimum.height * view.h)
  } else if (corner === 'se') {
    right = clamp(right + dx, left + minimum.width * view.w, view.x + view.w)
    bottom = clamp(bottom + dy, top + minimum.height * view.h, view.y + view.h)
  } else throw new RangeError(`Unknown resize corner: ${corner}`)
  return {
    x: clamp(cameraPoint({ x: right, y: top }, view).x, 0, 1),
    y: clamp(cameraPoint({ x: right, y: top }, view).y, 0, 1),
    width: (right - left) / view.w,
    height: (bottom - top) / view.h,
  }
}

export function validTransform(layout, moduleId, transform) {
  const next = cloneLayout(layout)
  const module = next.modules.find((item) => item.id === moduleId)
  if (!module) return false
  module.transform = transform
  try { generateZones(next); return true }
  catch { return false }
}

export class EditorSession {
  constructor(layout) {
    generateZones(layout)
    this.original = cloneLayout(layout)
    this.layout = cloneLayout(layout)
    this.selectedId = null
    this.interaction = null
    this.invalidTransform = null
  }

  begin(point, view) {
    const selected = this.layout.modules.find((module) => module.id === this.selectedId)
    const handle = selected && handleAt(selected.transform, point, view)
    const moduleId = handle ? selected.id : moduleAt(this.layout, point, view)
    this.selectedId = moduleId
    this.invalidTransform = null
    if (!moduleId) { this.interaction = null; return false }
    const module = this.layout.modules.find((item) => item.id === moduleId)
    this.interaction = {
      moduleId, kind: handle || 'drag', start: { ...point }, view: { ...view },
      transform: { ...module.transform },
    }
    return true
  }

  move(point) {
    const active = this.interaction
    if (!active) return false
    const module = this.layout.modules.find((item) => item.id === active.moduleId)
    const next = active.kind === 'drag'
      ? dragTransform(active.transform, active.start, point, active.view)
      : resizeTransform(active.transform, active.kind, active.start, point, active.view, module.type)
    if (validTransform(this.layout, active.moduleId, next)) {
      module.transform = next
      this.invalidTransform = null
    } else {
      this.invalidTransform = next
    }
    return true
  }

  end() {
    this.interaction = null
    this.invalidTransform = null
  }

  cancel() { return cloneLayout(this.original) }
  done() { generateZones(this.layout); return cloneLayout(this.layout) }
}
