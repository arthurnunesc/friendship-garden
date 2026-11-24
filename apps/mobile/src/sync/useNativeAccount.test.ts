import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFriend, type Friend } from '../garden/Friend'
import { createGardenAccount } from './gardenAccount'

const native = vi.hoisted(() => ({
  url: null as ((event: { url: string }) => void) | null,
  foreground: null as ((state: string) => void) | null,
  removeLink: vi.fn(),
  removeForeground: vi.fn(),
  getInitialURL: vi.fn<() => Promise<string | null>>(),
}))

vi.mock('./nativeAccount', () => ({ nativeAccount: null }))
vi.mock('react-native', () => ({
  Linking: {
    addEventListener: vi.fn((_event: string, listener: (event: { url: string }) => void) => {
      native.url = listener
      return { remove: native.removeLink }
    }),
    getInitialURL: native.getInitialURL,
  },
  AppState: {
    addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
      native.foreground = listener
      return { remove: native.removeForeground }
    }),
  },
}))

import { useNativeAccount } from './useNativeAccount'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

function setup(session: () => Promise<{ id: string, email: string } | null> = async () => null) {
  const friend: Friend = createFriend({ name: 'Offline friend' })
  const guest = { loadFriends: vi.fn(async () => [friend]), saveFriends: vi.fn(async () => {}) }
  const client = {
    session: vi.fn(session), google: vi.fn(async () => {}), email: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}), read: vi.fn(async () => ({ version: 1 as const, friends: [], interactions: [] })),
    merge: vi.fn(async () => ({ version: 1 as const, friends: [], interactions: [] })),
  }
  const account = createGardenAccount({ guest, persistence: { getItem: async () => null, setItem: async () => {} }, client,
    clock: () => ({ updatedAt: '2026-10-18T00:00:00.000Z', changeId: 'test' }) })
  const auth = {
    session: async () => null, google: async () => {}, email: async () => {}, signOut: async () => {}, getCookie: () => '',
    handleURL: vi.fn(async (_url: string, _coldStart?: boolean) => true),
  }
  return { friend, guest, client, runtime: { account, auth } }
}

async function mount(runtime: ReturnType<typeof setup>['runtime']) {
  let result!: ReturnType<typeof useNativeAccount>
  function Harness() { result = useNativeAccount(runtime); return null }
  let view!: ReactTestRenderer
  await act(async () => { view = create(createElement(Harness)) })
  return { view, get result() { return result } }
}

describe('useNativeAccount', () => {
  beforeEach(() => {
    native.url = null
    native.foreground = null
    native.removeLink.mockClear()
    native.removeForeground.mockClear()
    native.getInitialURL.mockReset().mockResolvedValue(null)
  })

  it('hydrates the offline guest garden while the auth session is still pending', async () => {
    const session = deferred<{ id: string, email: string } | null>()
    const f = setup(() => session.promise)
    const mounted = await mount(f.runtime)
    expect(mounted.result.state?.loaded).toBe(true)
    expect(await mounted.result.storage.loadFriends()).toEqual([f.friend])
    expect(f.client.session).toHaveBeenCalledOnce()
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    await act(async () => { mounted.view.unmount() })
    session.resolve(null)
  })

  it('handles an accepted link and refreshes identity without reading or uploading a garden', async () => {
    const f = setup()
    const mounted = await mount(f.runtime)
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalledTimes(1))
    f.client.session.mockClear()
    await act(async () => { native.url!({ url: 'garden://callback?code=valid' }) })
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalledOnce())
    expect(f.runtime.auth.handleURL).toHaveBeenCalledWith('garden://callback?code=valid', false)
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    await act(async () => { mounted.view.unmount() })
  })

  it('does not refresh identity when a link is rejected', async () => {
    const f = setup()
    f.runtime.auth.handleURL.mockResolvedValue(false)
    const mounted = await mount(f.runtime)
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalledOnce())
    f.client.session.mockClear()
    await act(async () => { native.url!({ url: 'garden://callback?invalid=1' }) })
    expect(f.runtime.auth.handleURL).toHaveBeenCalledWith('garden://callback?invalid=1', false)
    expect(f.client.session).not.toHaveBeenCalled()
    await act(async () => { mounted.view.unmount() })
  })

  it('refreshes identity when the app returns to the foreground', async () => {
    const f = setup()
    const mounted = await mount(f.runtime)
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalledOnce())
    f.client.session.mockClear()
    await act(async () => { native.foreground!('active') })
    await vi.waitFor(() => expect(f.client.session).toHaveBeenCalledOnce())
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    await act(async () => { mounted.view.unmount() })
  })

  it('removes listeners and ignores an initial URL that resolves after unmount', async () => {
    const initial = deferred<string | null>()
    native.getInitialURL.mockReturnValue(initial.promise)
    const f = setup()
    const mounted = await mount(f.runtime)
    await act(async () => { mounted.view.unmount() })
    expect(native.removeLink).toHaveBeenCalledOnce()
    expect(native.removeForeground).toHaveBeenCalledOnce()
    await act(async () => { initial.resolve('garden://callback?code=late') })
    expect(f.runtime.auth.handleURL).not.toHaveBeenCalled()
    expect(f.client.session).not.toHaveBeenCalled()
  })
})
