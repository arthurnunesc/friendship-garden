import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSection } from './AccountSection'
import type { GardenAccount, GardenAccountState } from '../sync/gardenAccount'

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles },
}))
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })

const user = { id: 'account-a', email: 'a@example.invalid' }

function state(patch: Partial<GardenAccountState> = {}): GardenAccountState {
  return {
    loaded: true, user: null, viewAccount: null, storage: {} as GardenAccountState['storage'],
    phase: 'local', error: null, ...patch,
  }
}

async function setup(accountState = state()) {
  const account = {
    refresh: vi.fn(async () => {}),
    enable: vi.fn(async (_choice: 'import' | 'account') => {}),
    sync: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    openOffline: vi.fn(async (_id: string) => {}),
    savedAccounts: vi.fn(() => []),
    client: { google: vi.fn(async () => {}), email: vi.fn(async (_email: string) => {}) },
  } as unknown as GardenAccount
  let view!: ReactTestRenderer
  await act(async () => { view = create(<AccountSection account={account} state={accountState} />) })
  return {
    account, view,
    press: async (label: string) => {
      await act(async () => { await view.root.findByProps({ accessibilityLabel: label }).props.onPress() })
    },
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('account section', () => {
  it('can sign out while background sync is in progress', async () => {
    const h = await setup(state({ user, viewAccount: user, phase: 'syncing' }))
    try {
      await h.press('Account and sync')
      await h.press('sign out & return to local garden')
      expect(h.account.signOut).toHaveBeenCalledOnce()
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('starts collapsed and makes no account request until an explicit press', async () => {
    const h = await setup()
    try {
      expect(h.view.root.findByProps({ accessibilityLabel: 'Account and sync' }).props.accessibilityState).toEqual({ expanded: false })
      expect(() => h.view.root.findByProps({ accessibilityLabel: 'continue with google' })).toThrow()
      expect(h.account.refresh).not.toHaveBeenCalled()
      expect(h.account.client.google).not.toHaveBeenCalled()
      expect(h.account.client.email).not.toHaveBeenCalled()
      expect(h.account.enable).not.toHaveBeenCalled()
      expect(h.account.sync).not.toHaveBeenCalled()
      expect(h.account.signOut).not.toHaveBeenCalled()
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('refreshes after the user explicitly starts Google sign-in', async () => {
    const h = await setup()
    try {
      await h.press('Account and sync')
      await h.press('continue with google')
      expect(h.account.client.google).toHaveBeenCalledOnce()
      expect(h.account.refresh).toHaveBeenCalledOnce()
      expect(vi.mocked(h.account.client.google).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(h.account.refresh).mock.invocationCallOrder[0])
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('keeps the email draft, gives same-device link guidance, and hides private failures', async () => {
    const h = await setup()
    try {
      await h.press('Account and sync')
      const input = h.view.root.findByProps({ accessibilityLabel: 'Email address' })
      await act(async () => { input.props.onChangeText(' person@example.invalid ') })
      await h.press('email a sign-in link')
      expect(h.account.client.email).toHaveBeenCalledWith('person@example.invalid')
      expect(JSON.stringify(h.view.toJSON())).toContain('it expires in five minutes. open it on this device')
      vi.mocked(h.account.client.email).mockRejectedValueOnce(new Error('private transport details'))
      await h.press('email a sign-in link')
      expect(h.view.root.findByProps({ accessibilityLabel: 'Email address' }).props.value).toBe(' person@example.invalid ')
      expect(JSON.stringify(h.view.toJSON())).toContain('Could not complete that account action. Please try again.')
      expect(JSON.stringify(h.view.toJSON())).not.toContain('private transport details')
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('uses only the explicit storage-consent action and does not upload before it', async () => {
    const h = await setup(state({ user }))
    try {
      await h.press('Account and sync')
      expect(h.account.enable).not.toHaveBeenCalled()
      await h.press('merge local garden & sync')
      expect(h.account.enable).toHaveBeenCalledWith('import')
      await h.press('use account garden only')
      expect(h.account.enable).toHaveBeenCalledWith('account')
      expect(h.account.enable).toHaveBeenCalledTimes(2)
      expect(h.account.sync).not.toHaveBeenCalled()
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('shows signed-in sync status, saved offline copies, and a return to the local garden', async () => {
    const h = await setup(state({ user, viewAccount: user, phase: 'ready' }))
    vi.mocked(h.account.savedAccounts).mockReturnValue([user])
    try {
      await h.press('Account and sync')
      expect(JSON.stringify(h.view.toJSON())).toContain('signed in as')
      expect(JSON.stringify(h.view.toJSON())).toContain('up to date')
      await h.press('sync now')
      expect(h.account.sync).toHaveBeenCalledOnce()
      await h.press('sign out & return to local garden')
      expect(h.account.signOut).toHaveBeenCalledOnce()
    } finally { await act(async () => { h.view.unmount() }) }

    const offline = await setup(state({ viewAccount: user, phase: 'offline' }))
    vi.mocked(offline.account.savedAccounts).mockReturnValue([user])
    try {
      await offline.press('Account and sync')
      expect(JSON.stringify(offline.view.toJSON())).toContain('saved on this device')
      await offline.press('open saved garden: a@example.invalid')
      expect(offline.account.openOffline).toHaveBeenCalledWith('account-a')
    } finally { await act(async () => { offline.view.unmount() }) }
  })
})
