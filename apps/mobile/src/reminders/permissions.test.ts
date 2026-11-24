import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotificationPermissionStatus, requestNotificationPermission } from './permissions'

const native = vi.hoisted(() => ({
  platform: { OS: 'android' },
  get: vi.fn(), request: vi.fn(), channel: vi.fn(),
}))
vi.mock('react-native', () => ({ Platform: native.platform }))
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: native.get,
  requestPermissionsAsync: native.request,
  setNotificationChannelAsync: native.channel,
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3, AUTHORIZED: 2, EPHEMERAL: 4 },
}))

beforeEach(() => {
  vi.clearAllMocks()
  native.platform.OS = 'android'
  native.get.mockResolvedValue({ status: 'undetermined' })
  native.request.mockResolvedValue({ status: 'granted' })
  native.channel.mockResolvedValue(undefined)
})

describe('notification permission adapter', () => {
  it('preserves Android requestability without prompting during a permission read', async () => {
    native.get.mockResolvedValue({ status: 'denied', canAskAgain: true })
    expect(await getNotificationPermissionStatus()).toBe('requestable')
    expect(native.request).not.toHaveBeenCalled()
  })
  it('keeps permanent Android denial and iOS denial distinct from requestability', async () => {
    native.get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    expect(await getNotificationPermissionStatus()).toBe('denied')
    native.platform.OS = 'ios'
    native.get.mockResolvedValue({ status: 'denied', canAskAgain: true })
    expect(await getNotificationPermissionStatus()).toBe('denied')
  })
  it('creates the Android channel before explicitly requesting permission', async () => {
    expect(await requestNotificationPermission()).toBe('granted')
    expect(native.channel).toHaveBeenCalledWith('friendship-garden', expect.any(Object))
    expect(native.channel.mock.invocationCallOrder[0]).toBeLessThan(native.request.mock.invocationCallOrder[0])
  })
  it('reads startup permission without requesting it', async () => {
    expect(await getNotificationPermissionStatus()).toBe('undetermined')
    expect(native.request).not.toHaveBeenCalled()
    expect(native.channel).not.toHaveBeenCalled()
  })
  it('does not create Android channels on iOS and returns denial calmly', async () => {
    native.platform.OS = 'ios'
    native.request.mockResolvedValue({ status: 'denied' })
    expect(await requestNotificationPermission()).toBe('denied')
    expect(native.channel).not.toHaveBeenCalled()
  })
  it('does not request permission if channel setup fails', async () => {
    native.channel.mockRejectedValueOnce(new Error('Channel unavailable'))
    await expect(requestNotificationPermission()).rejects.toThrow('Channel unavailable')
    expect(native.request).not.toHaveBeenCalled()
  })
  it('recognizes iOS provisional authorization as permission to deliver quietly', async () => {
    native.platform.OS = 'ios'
    native.get.mockResolvedValue({ status: 'undetermined', ios: { status: 3 } })
    expect(await getNotificationPermissionStatus()).toBe('granted')
  })
})
