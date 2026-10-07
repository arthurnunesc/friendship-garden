import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupSection } from './BackupSection'
import { createFriend, exportGarden } from '../garden/Friend'

const files = vi.hoisted(() => ({ pick: vi.fn(), share: vi.fn() }))
vi.mock('../garden/backupFiles', () => ({ pickBackup: files.pick, shareBackup: files.share }))
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
beforeEach(() => { vi.clearAllMocks() })

describe('backup section', () => {
  async function setup() {
    const onImport = vi.fn(async () => ({ success: true as const, friends: [] }))
    let view!: ReactTestRenderer
    await act(async () => { view = create(<BackupSection friends={[createFriend({ name: 'Original' })]} onImport={onImport} />) })
    const press = async (label: string) => {
      await act(async () => { await view.root.findByProps({ accessibilityLabel: label }).props.onPress() })
    }
    const text = () => JSON.stringify(view.toJSON())
    return { view, onImport, press, text }
  }
  it('validates and previews before replacing; cancellation leaves data alone', async () => {
    const imported = [createFriend({ name: 'Web Alice' })]
    files.pick.mockResolvedValue(JSON.stringify(exportGarden(imported)))
    const h = await setup()
    await h.press('Choose garden backup file')
    expect(h.text()).toContain('Web Alice')
    expect(h.onImport).not.toHaveBeenCalled()
    await h.press('Cancel garden replacement')
    expect(h.onImport).not.toHaveBeenCalled()
    await act(async () => { h.view.unmount() })
  })
  it('imports only on confirmation and reports success', async () => {
    files.pick.mockResolvedValue(JSON.stringify(exportGarden([])))
    const h = await setup()
    await h.press('Choose garden backup file')
    await h.press('Replace garden with backup')
    expect(h.onImport).toHaveBeenCalledWith(expect.objectContaining({ version: 1, friends: [] }))
    expect(h.text()).toContain('Imported 0 friends.')
    await act(async () => { h.view.unmount() })
  })
  it('reports bad JSON and storage errors without success feedback', async () => {
    files.pick.mockResolvedValue('{broken')
    const h = await setup()
    await h.press('Choose garden backup file')
    expect(h.text()).toContain('not valid JSON')
    expect(h.onImport).not.toHaveBeenCalled()
    files.pick.mockResolvedValue(JSON.stringify(exportGarden([])))
    await h.press('Choose garden backup file')
    h.onImport.mockRejectedValueOnce(new Error('Storage unavailable'))
    await h.press('Replace garden with backup')
    expect(h.text()).toContain('Storage unavailable')
    expect(h.text()).not.toContain('Imported 0 friends.')
    await act(async () => { h.view.unmount() })
  })
  it('handles picker cancellation and share errors without replacing data', async () => {
    files.pick.mockResolvedValue(null)
    files.share.mockRejectedValueOnce(new Error('Sharing unavailable'))
    const h = await setup()
    await h.press('Choose garden backup file')
    expect(h.onImport).not.toHaveBeenCalled()
    await h.press('Export garden backup')
    expect(h.text()).toContain('Sharing unavailable')
    await act(async () => { h.view.unmount() })
  })
  it('supports pasted backups and invalidates the preview when the draft changes', async () => {
    const h = await setup()
    await h.press('Paste garden backup JSON')
    const input = () => h.view.root.findByProps({ accessibilityLabel: 'Garden backup JSON' })
    await act(async () => { input().props.onChangeText(JSON.stringify(exportGarden([createFriend({ name: 'Pasted Alice' })]))) })
    await h.press('Review pasted garden backup')
    expect(h.text()).toContain('Pasted Alice')
    await act(async () => { input().props.onChangeText('{invalid') })
    expect(h.view.root.findAllByProps({ accessibilityLabel: 'Replace garden with backup' })).toHaveLength(0)
    await h.press('Review pasted garden backup')
    expect(h.text()).toContain('not valid JSON')
    expect(h.onImport).not.toHaveBeenCalled()
    await act(async () => { h.view.unmount() })
  })
})
