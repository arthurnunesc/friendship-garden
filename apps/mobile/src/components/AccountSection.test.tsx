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
    loaded: true, user: null, viewAccount: null, pending: false, storage: {} as GardenAccountState['storage'],
    phase: 'local', syncEnabled: false, error: null, ...patch,
  }
}

async function setup(accountState = state()) {
  const account = {
    refresh: vi.fn(async () => {}),
    enable: vi.fn(async (_choice: 'import' | 'account') => {}),
    sync: vi.fn(async () => {}),
    recoverCollision: vi.fn(async () => {}),
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
  it('offers consent again when a signed-in user views a paused saved copy', async () => {
    const h = await setup(state({ user, viewAccount: user, pending: true, syncEnabled: false }))
    try {
      await h.press('Account and sync')
      expect(h.view.root.findAllByProps({ accessibilityLabel: 'sync now' })).toHaveLength(0)
      expect(JSON.stringify(h.view.toJSON())).toContain('sync is paused')
      await h.press('use account garden only')
      expect(h.account.enable).toHaveBeenCalledWith('account')
    } finally { await act(async () => { h.view.unmount() }) }
  })
  it('closes the first sign-in choices without enabling sync', async () => {
    const h = await setup(state({ user }))
    try {
      await h.press('Account and sync')
      await h.press('keep using this local garden')
      expect(h.account.enable).not.toHaveBeenCalled()
      expect(h.view.root.findByProps({ accessibilityLabel: 'Account and sync' }).props.accessibilityState.expanded).toBe(false)
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('shows waiting edits and only resolves a collision on explicit retry', async () => {
    const h = await setup(state({ user, viewAccount: user, pending: true, phase: 'conflict' }))
    try {
      await h.press('Account and sync')
      expect(JSON.stringify(h.view.toJSON())).toContain('changes waiting to sync')
      expect(h.account.recoverCollision).not.toHaveBeenCalled()
      await h.press('retry with this device’s edits')
      expect(h.account.recoverCollision).toHaveBeenCalledOnce()
    } finally { await act(async () => { h.view.unmount() }) }
  })
  it('offers reminders for a signed-in guest and resets on email change without sync consent', async () => {
    const h = await setup(state({ user }))
    const reminders = { read: vi.fn(async () => ({ enabled: false as const })), update: vi.fn() }
    h.account.client.emailReminders = reminders
    try {
      await h.press('Account and sync')
      await h.press('email reminders')
      expect(reminders.read).toHaveBeenCalledWith(user.id)
      expect(h.account.enable).not.toHaveBeenCalled()
      expect(h.account.sync).not.toHaveBeenCalled()
      await act(async () => { h.view.update(<AccountSection account={h.account} state={state({ user: { ...user, email: 'changed@example.invalid' } })} />) })
      expect(h.view.root.findByProps({ accessibilityLabel: 'email reminders' }).props.accessibilityState.expanded).toBe(false)
      await h.press('email reminders')
      expect(reminders.read).toHaveBeenCalledTimes(2)
    } finally { await act(async () => { h.view.unmount() }) }
  })

  it('can sign out while background sync is in progress', async () => {
    const h = await setup(state({ user, viewAccount: user, phase: 'syncing', syncEnabled: true }))
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
    const h = await setup(state({ user, viewAccount: user, phase: 'ready', syncEnabled: true }))
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
