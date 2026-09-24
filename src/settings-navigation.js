export const SETTINGS_PAGES = Object.freeze({
  root: 'Settings',
  instrument: 'Instrument',
  effects: 'Effects',
  camera: 'Camera & Display',
  detection: 'Detection',
})

// Settings navigation is transient UI state. It does not change saved app settings.
export function createSettingsNavigation() {
  let open = false
  let page = 'root'

  return {
    get open() { return open },
    get page() { return page },
    show() { open = true; page = 'root' },
    close() { open = false; page = 'root' },
    visit(next) {
      if (!open || next === 'root' || !Object.prototype.hasOwnProperty.call(SETTINGS_PAGES, next)) return false
      page = next
      return true
    },
    back() {
      if (!open || page === 'root') return false
      page = 'root'
      return true
    },
  }
}
