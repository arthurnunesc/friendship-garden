import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeNotificationPort, scheduleStorage } from './notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'

const native = vi.hoisted(() => ({
  list: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), handler: vi.fn(),
  channel: vi.fn(), platform: { OS: 'android' },
}))
vi.mock('react-native', () => ({ Platform: native.platform }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: native.list,
  scheduleNotificationAsync: native.schedule,
  cancelScheduledNotificationAsync: native.cancel,
  setNotificationHandler: native.handler,
  setNotificationChannelAsync: native.channel,
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}))

beforeEach(() => {
  vi.clearAllMocks()
  native.platform.OS = 'android'
  native.channel.mockResolvedValue(undefined)
  native.schedule.mockImplementation(async (request) => request.identifier)
})

describe('native local notifications', () => {
  it('schedules the exact date and stable ID on the reminder channel', async () => {
    const date = new Date('2026-10-07T12:01:00Z')
    expect(await nativeNotificationPort.schedule({
      identifier: 'friendship-garden:alice', friendId: 'alice', date,
      title: 'Friendship Garden', body: 'Alice may appreciate a check-in.',
    })).toBe('friendship-garden:alice')
    expect(native.schedule).toHaveBeenCalledWith({
      identifier: 'friendship-garden:alice',
      content: {
        title: 'Friendship Garden', body: 'Alice may appreciate a check-in.', sound: 'default',
        data: { friendId: 'alice', scheduledFor: date.toISOString() },
      },
      trigger: { type: 'date', date, channelId: 'friendship-garden' },
    })
    expect(native.channel.mock.invocationCallOrder[0]).toBeLessThan(native.schedule.mock.invocationCallOrder[0])
  })
  it('reads owned OS schedules even when the registry was lost', async () => {
    native.list.mockResolvedValue([
      { identifier: 'other:task', content: { title: 'Other', body: 'Keep', data: {} } },
      { identifier: 'friendship-garden:alice', content: {
        title: 'Friendship Garden', body: 'Alice may appreciate a check-in.',
        data: { friendId: 'alice', scheduledFor: '2026-10-07T12:01:00Z' },
      } },
    ])
    expect(await nativeNotificationPort.list()).toEqual([{
      identifier: 'friendship-garden:alice', friendId: 'alice', title: 'Friendship Garden',
      body: 'Alice may appreciate a check-in.', date: new Date('2026-10-07T12:01:00Z'),
    }])
  })
  it('persists identifiers separately from garden and setting data', async () => {
    await scheduleStorage.save(['friendship-garden:alice'])
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'friendship-garden:v1:scheduled-notifications', '["friendship-garden:alice"]',
    )
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('["friendship-garden:alice","other:task",null]')
    expect(await scheduleStorage.load()).toEqual(['friendship-garden:alice'])
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('{broken')
    expect(await scheduleStorage.load()).toEqual([])
  })
  it('cancels through the native OS adapter', async () => {
    await nativeNotificationPort.cancel('friendship-garden:alice')
    expect(native.cancel).toHaveBeenCalledWith('friendship-garden:alice')
  })
})
