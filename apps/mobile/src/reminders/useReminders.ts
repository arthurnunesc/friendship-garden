import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Friend } from '../garden/Friend'
import { nativeReminderScheduler } from './notifications'
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from './permissions'
import {
  DEFAULT_REMINDER_SETTINGS,
  isReminderTime,
  loadReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from './settings'

type ReminderScheduler = {
  reconcile(
    friends: Friend[],
    settings: ReminderSettings,
    permissionGranted: boolean,
  ): Promise<void>
}

export interface ReminderDependencies {
  storage: {
    load(): Promise<ReminderSettings>
    save(settings: ReminderSettings): Promise<void>
  }
  permissions: {
    get(): Promise<PermissionStatus>
    request(): Promise<PermissionStatus>
  }
  scheduler: ReminderScheduler
}

const defaultDependencies: ReminderDependencies = {
  storage: { load: loadReminderSettings, save: saveReminderSettings },
  permissions: {
    get: getNotificationPermissionStatus,
    request: requestNotificationPermission,
  },
  scheduler: nativeReminderScheduler,
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not update reminders.'
}

function validSettings(settings: ReminderSettings): ReminderSettings {
  const candidate = settings as Partial<ReminderSettings> | null
  return {
    enabled: typeof candidate?.enabled === 'boolean'
      ? candidate.enabled
      : DEFAULT_REMINDER_SETTINGS.enabled,
    preferredTime: typeof candidate?.preferredTime === 'string' && isReminderTime(candidate.preferredTime)
      ? candidate.preferredTime
      : DEFAULT_REMINDER_SETTINGS.preferredTime,
  }
}

export function useReminders(
  friends: Friend[],
  gardenLoaded: boolean,
  dependencies: ReminderDependencies = defaultDependencies,
) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('undetermined')
  const [permissionReady, setPermissionReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const mutationInFlight = useRef(false)
  const permissionRead = useRef(0)
  const settingsRead = useRef(0)
  const settingsRef = useRef(settings)
  const permissionRef = useRef(permissionStatus)
  const permissionReadyRef = useRef(permissionReady)
  const friendsRef = useRef(friends)
  const gardenLoadedRef = useRef(gardenLoaded)
  const loadedRef = useRef(loaded)

  settingsRef.current = settings
  permissionRef.current = permissionStatus
  permissionReadyRef.current = permissionReady
  friendsRef.current = friends
  gardenLoadedRef.current = gardenLoaded
  loadedRef.current = loaded

  const reconcile = useCallback(async (
    nextSettings = settingsRef.current,
    nextPermission = permissionRef.current,
  ) => {
    if (!loadedRef.current || !permissionReadyRef.current || !gardenLoadedRef.current) return
    try {
      await dependencies.scheduler.reconcile(
        friendsRef.current,
        nextSettings,
        nextPermission === 'granted',
      )
    } catch (cause) {
      if (mounted.current) setError(message(cause))
    }
  }, [dependencies.scheduler])

  const hydrate = useCallback(async () => {
    const settingsReadId = ++settingsRead.current
    const permissionReadId = ++permissionRead.current
    if (mounted.current) setError(null)

    const [stored, permission] = await Promise.allSettled([
      dependencies.storage.load(),
      dependencies.permissions.get(),
    ])
    if (!mounted.current || settingsRead.current !== settingsReadId) return

    if (stored.status === 'fulfilled') {
      const nextSettings = validSettings(stored.value)
      settingsRef.current = nextSettings
      loadedRef.current = true
      setSettings(nextSettings)
      setLoaded(true)
    } else {
      loadedRef.current = false
      setLoaded(false)
      setError(message(stored.reason))
    }

    if (permissionRead.current !== permissionReadId) return
    if (permission.status === 'fulfilled') {
      permissionRef.current = permission.value
      permissionReadyRef.current = true
      setPermissionStatus(permission.value)
      setPermissionReady(true)
    } else {
      permissionReadyRef.current = false
      setPermissionReady(false)
      setError(message(permission.reason))
    }
  }, [dependencies.permissions, dependencies.storage])

  useEffect(() => {
    mounted.current = true
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    void reconcile(settings, permissionStatus)
  }, [friends, gardenLoaded, loaded, permissionReady, permissionStatus, reconcile, settings])

  const refreshPermissions = useCallback(async () => {
    const readId = ++permissionRead.current
    try {
      const nextPermission = await dependencies.permissions.get()
      if (!mounted.current || permissionRead.current !== readId) return
      const unchanged = permissionRef.current === nextPermission
      permissionRef.current = nextPermission
      permissionReadyRef.current = true
      setPermissionStatus(nextPermission)
      setPermissionReady(true)
      setError(null)
      if (unchanged) await reconcile(settingsRef.current, nextPermission)
    } catch (cause) {
      if (mounted.current && permissionRead.current === readId) {
        setError(message(cause))
      }
    }
  }, [dependencies.permissions, reconcile])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermissions()
    })
    return () => subscription.remove()
  }, [refreshPermissions])

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!loadedRef.current) return
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    if (mounted.current) {
      setBusy(true)
      setError(null)
    }

    try {
      let nextPermission = permissionRef.current
      if (enabled) {
        ++permissionRead.current
        nextPermission = await dependencies.permissions.get()
        if (!mounted.current) return
        ++permissionRead.current
        permissionRef.current = nextPermission
        permissionReadyRef.current = true
        setPermissionStatus(nextPermission)
        setPermissionReady(true)

        if (nextPermission === 'undetermined' || nextPermission === 'requestable') {
          nextPermission = await dependencies.permissions.request()
          if (!mounted.current) return
          ++permissionRead.current
          permissionRef.current = nextPermission
          permissionReadyRef.current = true
          setPermissionStatus(nextPermission)
          setPermissionReady(true)
        }
        if (nextPermission !== 'granted') return
      }

      const nextSettings = { ...settingsRef.current, enabled }
      await dependencies.storage.save(nextSettings)
      if (!mounted.current) return
      settingsRef.current = nextSettings
      setSettings(nextSettings)
    } catch (cause) {
      if (mounted.current) setError(message(cause))
    } finally {
      mutationInFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }, [dependencies.permissions, dependencies.storage])

  const setTime = useCallback(async (preferredTime: string) => {
    if (!loadedRef.current) return
    if (!isReminderTime(preferredTime)) {
      if (mounted.current) setError('Enter a time from 00:00 to 23:59.')
      return
    }
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    if (mounted.current) {
      setBusy(true)
      setError(null)
    }

    try {
      const nextSettings = { ...settingsRef.current, preferredTime }
      await dependencies.storage.save(nextSettings)
      if (!mounted.current) return
      settingsRef.current = nextSettings
      setSettings(nextSettings)
    } catch (cause) {
      if (mounted.current) setError(message(cause))
    } finally {
      mutationInFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }, [dependencies.storage])

  useEffect(() => () => { mounted.current = false }, [])

  return {
    settings,
    permissionStatus,
    loaded,
    busy,
    error,
    setEnabled,
    setTime,
    refreshPermissions,
    retryLoad: hydrate,
  }
}
