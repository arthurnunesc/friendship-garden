import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Friend } from '../garden/Friend'
import type { ReminderSettings } from './settings'
import { useReminders, type ReminderDependencies } from './useReminders'

const native = vi.hoisted(() => {
  let activeListener: (() => void) | undefined
  return {
    addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
      activeListener = () => listener('active')
      return { remove: vi.fn(() => { activeListener = undefined }) }
    }),
    activate: () => activeListener?.(),
  }
})

vi.mock('react-native', () => ({
  AppState: { addEventListener: native.addEventListener },
}))
vi.mock('./settings', () => ({
  loadReminderSettings: vi.fn(),
  saveReminderSettings: vi.fn(),
  DEFAULT_REMINDER_SETTINGS: { enabled: false, preferredTime: '09:00' },
  isReminderTime: (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
}))
vi.mock('./permissions', () => ({
  getNotificationPermissionStatus: vi.fn(),
  requestNotificationPermission: vi.fn(),
}))
vi.mock('./notifications', () => ({ nativeReminderScheduler: { reconcile: vi.fn() } }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const friends: Friend[] = [{
  id: 'alice', name: 'Alice', cadenceDays: 14, interactions: [], createdAt: '2026-01-01T00:00:00.000Z',
}]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function dependencies(overrides: Partial<ReminderDependencies> = {}): ReminderDependencies {
  return {
    storage: {
      load: vi.fn(async (): Promise<ReminderSettings> => ({ enabled: false, preferredTime: '09:00' })),
      save: vi.fn(async () => {}),
    },
    permissions: {
      get: vi.fn(async () => 'granted' as const),
      request: vi.fn(async () => 'granted' as const),
    },
    scheduler: { reconcile: vi.fn(async () => {}) },
    ...overrides,
  }
}

describe('useReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads permission without requesting it at startup', async () => {
    const deps = dependencies()
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })

    expect(reminders.loaded).toBe(true)
    expect(deps.permissions.get).toHaveBeenCalledTimes(1)
    expect(deps.permissions.request).not.toHaveBeenCalled()
    await act(async () => { view.unmount() })
  })

  it('requests Android permission only on explicit enable when denial is requestable', async () => {
    const deps = dependencies({
      permissions: {
        get: vi.fn(async () => 'requestable' as const),
        request: vi.fn(async () => 'granted' as const),
      },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { native.activate() })
    expect(deps.permissions.request).not.toHaveBeenCalled()
    expect(reminders.settings.enabled).toBe(false)
    await act(async () => { await reminders.setEnabled(true) })
    expect(deps.permissions.request).toHaveBeenCalledTimes(1)
    expect(reminders.permissionStatus).toBe('granted')
    expect(reminders.settings.enabled).toBe(true)
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      friends, { enabled: true, preferredTime: '09:00' }, true,
    )
    await act(async () => { view.unmount() })
  })

  it.each(['requestable', 'denied'] as const)(
    'does not enable or schedule after a permission request returns %s', async (result) => {
      const deps = dependencies({
        permissions: {
          get: vi.fn(async () => 'requestable' as const),
          request: vi.fn(async () => result),
        },
      })
      let reminders!: ReturnType<typeof useReminders>
      function Harness() { reminders = useReminders(friends, true, deps); return null }
      let view!: ReactTestRenderer
      await act(async () => { view = create(createElement(Harness)) })
      await act(async () => { await reminders.setEnabled(true) })
      expect(reminders.permissionStatus).toBe(result)
      expect(reminders.settings.enabled).toBe(false)
      expect(deps.storage.save).not.toHaveBeenCalled()
      expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
        friends, { enabled: false, preferredTime: '09:00' }, false,
      )
      await act(async () => { view.unmount() })
    },
  )

  it('does not request permanently denied permission on explicit enable', async () => {
    const deps = dependencies({
      permissions: { get: vi.fn(async () => 'denied' as const), request: vi.fn() },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer
    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await reminders.setEnabled(true) })
    expect(deps.permissions.request).not.toHaveBeenCalled()
    expect(reminders.settings.enabled).toBe(false)
    expect(deps.storage.save).not.toHaveBeenCalled()
    await act(async () => { view.unmount() })
  })

  it('refreshes a denied permission when the app becomes active', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce('denied')
      .mockResolvedValueOnce('granted')
    const deps = dependencies({ permissions: { get, request: vi.fn() } })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    expect(reminders.permissionStatus).toBe('denied')
    await act(async () => { native.activate() })

    expect(reminders.permissionStatus).toBe('granted')
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      friends,
      { enabled: false, preferredTime: '09:00' },
      true,
    )
    await act(async () => { view.unmount() })
  })

  it('persists enabled and disabled transitions without losing the chosen time', async () => {
    const deps = dependencies({
      storage: {
        load: vi.fn(async () => ({ enabled: false, preferredTime: '18:37' })),
        save: vi.fn(async () => {}),
      },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await reminders.setEnabled(true) })
    await act(async () => { await reminders.setEnabled(false) })

    expect(deps.storage.save).toHaveBeenNthCalledWith(1, { enabled: true, preferredTime: '18:37' })
    expect(deps.storage.save).toHaveBeenLastCalledWith({ enabled: false, preferredTime: '18:37' })
    await act(async () => { view.unmount() })
  })

  it('does not reconcile until the garden has hydrated', async () => {
    const deps = dependencies()
    function Harness({ gardenLoaded }: { gardenLoaded: boolean }) {
      useReminders(friends, gardenLoaded, deps)
      return null
    }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness, { gardenLoaded: false })) })
    expect(deps.scheduler.reconcile).not.toHaveBeenCalled()
    await act(async () => { view.update(createElement(Harness, { gardenLoaded: true })) })
    expect(deps.scheduler.reconcile).toHaveBeenCalledWith(
      friends,
      { enabled: false, preferredTime: '09:00' },
      true,
    )
    await act(async () => { view.unmount() })
  })

  it('uses denied permission to reconcile without active reminders', async () => {
    const deps = dependencies({
      storage: { load: vi.fn(async () => ({ enabled: true, preferredTime: '09:00' })), save: vi.fn(async () => {}) },
      permissions: { get: vi.fn(async () => 'denied' as const), request: vi.fn() },
    })
    function Harness() { useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })

    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      friends,
      { enabled: true, preferredTime: '09:00' },
      false,
    )
    await act(async () => { view.unmount() })
  })

  it('reconciles when friends or reminder settings change', async () => {
    const deps = dependencies()
    const bob = { ...friends[0], id: 'bob', name: 'Bob' }
    let reminders!: ReturnType<typeof useReminders>
    function Harness({ items }: { items: Friend[] }) {
      reminders = useReminders(items, true, deps)
      return null
    }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness, { items: friends })) })
    vi.mocked(deps.scheduler.reconcile).mockClear()
    await act(async () => { view.update(createElement(Harness, { items: [bob] })) })
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      [bob], { enabled: false, preferredTime: '09:00' }, true,
    )
    await act(async () => { await reminders.setTime('18:37') })
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      [bob], { enabled: false, preferredTime: '18:37' }, true,
    )
    await act(async () => { view.unmount() })
  })

  it('surfaces collaborator failures instead of rejecting user actions', async () => {
    const deps = dependencies({
      storage: {
        load: vi.fn(async () => ({ enabled: false, preferredTime: '09:00' })),
        save: vi.fn(async () => { throw new Error('storage unavailable') }),
      },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => { await expect(reminders.setEnabled(true)).resolves.toBeUndefined() })
    expect(reminders.error).toBe('storage unavailable')
    await act(async () => { view.unmount() })
  })

  it('shows permission read failures', async () => {
    const deps = dependencies({
      permissions: { get: vi.fn(async () => { throw new Error('permission unavailable') }), request: vi.fn() },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })

    expect(reminders.error).toBe('permission unavailable')
    await act(async () => { view.unmount() })
  })

  it('shows scheduler failures', async () => {
    const deps = dependencies({
      scheduler: { reconcile: vi.fn(async () => { throw new Error('scheduler unavailable') }) },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })

    expect(reminders.error).toBe('scheduler unavailable')
    await act(async () => { view.unmount() })
  })

  it('does not become ready, reconcile, or save after settings hydration fails', async () => {
    const deps = dependencies({
      storage: {
        load: vi.fn(async () => { throw new Error('settings unavailable') }),
        save: vi.fn(async () => {}),
      },
    })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    await act(async () => {
      await reminders.setTime('18:37')
      await reminders.setEnabled(true)
    })

    expect(reminders.loaded).toBe(false)
    expect(reminders.error).toBe('settings unavailable')
    expect(deps.scheduler.reconcile).not.toHaveBeenCalled()
    expect(deps.storage.save).not.toHaveBeenCalled()
    await act(async () => { view.unmount() })
  })

  it('retries failed settings hydration before allowing reconciliation', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('settings unavailable'))
      .mockResolvedValueOnce({ enabled: false, preferredTime: '18:37' })
    const deps = dependencies({ storage: { load, save: vi.fn(async () => {}) } })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    expect(reminders.loaded).toBe(false)
    await act(async () => { await reminders.retryLoad() })

    expect(reminders.loaded).toBe(true)
    expect(reminders.settings).toEqual({ enabled: false, preferredTime: '18:37' })
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      friends, { enabled: false, preferredTime: '18:37' }, true,
    )
    await act(async () => { view.unmount() })
  })

  it('does not reconcile on an invalid startup permission read, then recovers on refresh', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('permission unavailable'))
      .mockResolvedValueOnce('granted')
    const deps = dependencies({ permissions: { get, request: vi.fn() } })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    expect(reminders.loaded).toBe(true)
    expect(reminders.error).toBe('permission unavailable')
    expect(deps.scheduler.reconcile).not.toHaveBeenCalled()

    await act(async () => { await reminders.refreshPermissions() })

    expect(reminders.permissionStatus).toBe('granted')
    expect(deps.scheduler.reconcile).toHaveBeenLastCalledWith(
      friends, { enabled: false, preferredTime: '09:00' }, true,
    )
    await act(async () => { view.unmount() })
  })

  it('preserves a known permission and scheduled work when a foreground read fails', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce('granted')
      .mockRejectedValueOnce(new Error('permission unavailable'))
    const deps = dependencies({ permissions: { get, request: vi.fn() } })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    vi.mocked(deps.scheduler.reconcile).mockClear()
    await act(async () => { native.activate() })

    expect(reminders.permissionStatus).toBe('granted')
    expect(reminders.error).toBe('permission unavailable')
    expect(deps.scheduler.reconcile).not.toHaveBeenCalled()
    await act(async () => { view.unmount() })
  })

  it('keeps an explicit enable permission result over a concurrent foreground read', async () => {
    const explicitRead = deferred<'granted' | 'denied' | 'undetermined'>()
    const foregroundRead = deferred<'granted' | 'denied' | 'undetermined'>()
    const get = vi.fn()
      .mockResolvedValueOnce('granted')
      .mockImplementationOnce(() => explicitRead.promise)
      .mockImplementationOnce(() => foregroundRead.promise)
    const deps = dependencies({ permissions: { get, request: vi.fn() } })
    let reminders!: ReturnType<typeof useReminders>
    function Harness() { reminders = useReminders(friends, true, deps); return null }
    let view!: ReactTestRenderer

    await act(async () => { view = create(createElement(Harness)) })
    let enabling!: Promise<void>
    await act(async () => {
      enabling = reminders.setEnabled(true)
      await Promise.resolve()
      native.activate()
      await Promise.resolve()
    })
    await act(async () => { foregroundRead.resolve('denied') })
    await act(async () => { explicitRead.resolve('granted'); await enabling })

    expect(reminders.permissionStatus).toBe('granted')
    expect(reminders.settings.enabled).toBe(true)
    expect(deps.storage.save).toHaveBeenLastCalledWith({ enabled: true, preferredTime: '09:00' })
    await act(async () => { view.unmount() })
  })
})
