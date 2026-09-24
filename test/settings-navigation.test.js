import test from 'node:test'
import assert from 'node:assert/strict'
import { createSettingsNavigation, SETTINGS_PAGES } from '../src/settings-navigation.js'

test('settings opens at root and visits each category', () => {
  const navigation = createSettingsNavigation()
  assert.equal(navigation.open, false)
  assert.equal(navigation.page, 'root')
  navigation.show()
  assert.equal(navigation.open, true)
  assert.equal(navigation.page, 'root')
  for (const page of ['instrument', 'effects', 'camera', 'detection']) {
    assert.equal(navigation.visit(page), true)
    assert.equal(navigation.page, page)
    assert.equal(navigation.back(), true)
    assert.equal(navigation.page, 'root')
  }
  assert.equal(SETTINGS_PAGES.camera, 'Camera & Display')
})

test('settings close and reopen return to root, and invalid transitions do nothing', () => {
  const navigation = createSettingsNavigation()
  assert.equal(navigation.visit('instrument'), false)
  navigation.show()
  assert.equal(navigation.visit('unknown'), false)
  assert.equal(navigation.visit('root'), false)
  assert.equal(navigation.back(), false)
  navigation.visit('instrument')
  navigation.close()
  assert.equal(navigation.open, false)
  assert.equal(navigation.page, 'root')
  navigation.show()
  assert.equal(navigation.page, 'root')
})
