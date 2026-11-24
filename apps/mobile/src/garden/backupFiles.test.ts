import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickBackup, shareBackup } from './backupFiles'
import { createFriend } from './Friend'

const native = vi.hoisted(() => ({ pick: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn(), available: vi.fn(), share: vi.fn() }))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: native.pick }))
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }))
vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    exists = true
    uri: string
    constructor(base: string | { uri: string }, name?: string) { this.uri = (typeof base === 'string' ? base : base.uri) + (name ?? '') }
    text = native.read
    write = native.write
    delete = native.remove
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  native.available.mockResolvedValue(true)
  native.share.mockResolvedValue(undefined)
  native.read.mockResolvedValue('{"version":1,"friends":[]}')
})

describe('native backup files', () => {
  it('treats document-picker cancellation as no import', async () => {
    native.pick.mockResolvedValue({ canceled: true, assets: null })
    expect(await pickBackup()).toBeNull()
    expect(native.read).not.toHaveBeenCalled()
  })
  it('reads the cached document and removes its private copy', async () => {
    native.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/backup.json' }] })
    expect(await pickBackup()).toBe('{"version":1,"friends":[]}')
    expect(native.pick).toHaveBeenCalledWith({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true, multiple: false })
    expect(native.remove).toHaveBeenCalledOnce()
  })
  it('exports the web-compatible v1 shape through the native share sheet', async () => {
    const friends = [createFriend({ name: 'Alice' })]
    await shareBackup(friends)
    expect(JSON.parse(native.write.mock.calls[0][0])).toMatchObject({ version: 1, friends: JSON.parse(JSON.stringify(friends)) })
    expect(native.share).toHaveBeenCalledWith(expect.stringMatching(/friendship-garden-.*\.json$/), {
      mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save or share your garden backup',
    })
    expect(native.remove).toHaveBeenCalledOnce()
  })
  it('does not write personal data when sharing is unavailable', async () => {
    native.available.mockResolvedValue(false)
    await expect(shareBackup([])).rejects.toThrow('File sharing is not available on this device.')
    expect(native.write).not.toHaveBeenCalled()
  })
  it('cleans up and exposes sharing failures', async () => {
    native.share.mockRejectedValueOnce(new Error('Could not share'))
    await expect(shareBackup([])).rejects.toThrow('Could not share')
    expect(native.remove).toHaveBeenCalledOnce()
  })
})
