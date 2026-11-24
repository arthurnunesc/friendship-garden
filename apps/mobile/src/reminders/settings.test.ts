import { describe, it, expect, vi, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadReminderSettings, saveReminderSettings } from './settings'
import type { ReminderSettings } from './settings'

const memory: Record<string, string> = {}

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(memory[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      memory[key] = value
      return Promise.resolve()
    }),
  },
}))

beforeEach(() => {
  for (const k of Object.keys(memory)) {
    delete memory[k]
  }
  vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) =>
    Promise.resolve(memory[key] ?? null),
  )
  vi.mocked(AsyncStorage.setItem).mockImplementation((key: string, value: string) => {
    memory[key] = value
    return Promise.resolve()
  })
})

describe('loadReminderSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const settings = await loadReminderSettings()
    expect(settings).toEqual({ enabled: false, preferredTime: '09:00' })
  })

  it('loads stored enabled and preferredTime', async () => {
    memory['friendship-garden:v1:reminder-settings'] = JSON.stringify({
      enabled: true,
      preferredTime: '18:30',
    })
    const settings = await loadReminderSettings()
    expect(settings).toEqual({ enabled: true, preferredTime: '18:30' })
  })

  it('ignores invalid enabled type', async () => {
    memory['friendship-garden:v1:reminder-settings'] = JSON.stringify({
      enabled: 'yes',
      preferredTime: '10:00',
    })
    const settings = await loadReminderSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.preferredTime).toBe('10:00')
  })

  it('falls back to default preferredTime for invalid format', async () => {
    memory['friendship-garden:v1:reminder-settings'] = JSON.stringify({
      enabled: true,
      preferredTime: '9am',
    })
    const settings = await loadReminderSettings()
    expect(settings.preferredTime).toBe('09:00')
  })

  it('falls back to the default for an out-of-range clock time', async () => {
    memory['friendship-garden:v1:reminder-settings'] = JSON.stringify({
      enabled: true,
      preferredTime: '99:99',
    })

    await expect(loadReminderSettings()).resolves.toEqual({
      enabled: true,
      preferredTime: '09:00',
    })
  })

  it('falls back to default preferredTime for missing key', async () => {
    memory['friendship-garden:v1:reminder-settings'] = JSON.stringify({
      enabled: true,
    })
    const settings = await loadReminderSettings()
    expect(settings.preferredTime).toBe('09:00')
  })

  it('survives corrupted JSON', async () => {
    memory['friendship-garden:v1:reminder-settings'] = '{broken'
    const settings = await loadReminderSettings()
    expect(settings).toEqual({ enabled: false, preferredTime: '09:00' })
  })

  it('rejects when persistent storage cannot be read', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(loadReminderSettings()).rejects.toThrow('storage unavailable')
  })
})

describe('saveReminderSettings', () => {
  it('persists settings that load correctly', async () => {
    const settings: ReminderSettings = {
      enabled: true,
      preferredTime: '14:00',
    }
    await saveReminderSettings(settings)
    const loaded = await loadReminderSettings()
    expect(loaded).toEqual(settings)
  })

  it('round-trips a precise valid clock time', async () => {
    await saveReminderSettings({ enabled: true, preferredTime: '18:37' })

    await expect(loadReminderSettings()).resolves.toEqual({
      enabled: true,
      preferredTime: '18:37',
    })
  })

  it('overwrites previous settings', async () => {
    await saveReminderSettings({ enabled: false, preferredTime: '09:00' })
    await saveReminderSettings({ enabled: true, preferredTime: '22:00' })
    const loaded = await loadReminderSettings()
    expect(loaded).toEqual({ enabled: true, preferredTime: '22:00' })
  })
})
