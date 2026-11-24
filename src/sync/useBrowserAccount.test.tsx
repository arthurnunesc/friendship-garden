import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorageStore } from '../friends/storage'
import { useBrowserAccount } from './useBrowserAccount'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})

afterEach(() => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  vi.unstubAllGlobals()
})

describe('exclusive browser account-cache lease', () => {
  it('keeps the local garden usable when storage locking is unavailable', () => {
    const { result } = renderHook(() => useBrowserAccount(localStorageStore))
    expect(result.current.account).toBeNull()
    expect(result.current.issue).toContain('local garden still works')
  })

  it('does not initialize an account writer if another tab owns the cache', async () => {
    const request = vi.fn(async (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const { result } = renderHook(() => useBrowserAccount(localStorageStore))
    await waitFor(() => expect(result.current.issue).toContain('another tab'))
    expect(result.current.account).toBeNull()
  })

  it('holds the lease while mounted and releases it on unmount', async () => {
    let released = false
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
        await callback({ name: 'fixture' })
        released = true
      },
    } })
    const { result, unmount } = renderHook(() => useBrowserAccount(localStorageStore))
    await waitFor(() => expect(result.current.account).not.toBeNull())
    expect(released).toBe(false)
    unmount()
    await waitFor(() => expect(released).toBe(true))
  })

  it('handles Strict Mode setup/cleanup without leaving a second writer active', async () => {
    let active = 0
    let peak = 0
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
        active += 1
        peak = Math.max(peak, active)
        try { await callback({}) } finally { active -= 1 }
      },
    } })
    const { result, unmount } = renderHook(() => useBrowserAccount(localStorageStore), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.account).not.toBeNull())
    expect(active).toBe(1)
    expect(peak).toBe(1)
    act(() => unmount())
    await waitFor(() => expect(active).toBe(0))
  })
})
