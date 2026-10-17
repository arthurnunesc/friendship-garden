import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Friend } from '../friends/Friend'
import type { GardenStorage } from '../friends/storage'
import { createFakeStorage } from '../test/fakeStorage'
import { createGardenAccount } from '../sync/gardenAccount'
import type { AccountClient, AccountUser } from '../sync/accountClient'
import { mergeGardenSnapshots, type SyncSnapshot } from '../../packages/garden-sync/src/snapshot'
import { recordGardenChanges } from '../../packages/garden-sync/src/changes'

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
const localFriend: Friend = { id: 'guest-friend', name: 'Guest Friend', cadenceDays: 14, interactions: [], createdAt: '2026-01-01T00:00:00.000Z' }
const remoteFriend: Friend = { id: 'remote-friend', name: 'Remote Friend', cadenceDays: 14, interactions: [], createdAt: '2026-02-01T00:00:00.000Z' }
const userA: AccountUser = { id: 'account-a', email: 'a@example.invalid' }

function setup({
  guest = [localFriend],
  signedIn = userA,
  remote = empty(),
  saveAccount = () => {},
}: {
  guest?: Friend[]
  signedIn?: AccountUser | null
  remote?: SyncSnapshot
  saveAccount?: (key: string, value: string) => void
} = {}) {
  const guestStorage: GardenStorage = createFakeStorage(guest)
  const persistence = { getItem: () => null, setItem: vi.fn(saveAccount) }
  const client = {
    session: vi.fn(async () => signedIn),
    google: vi.fn(async () => {}),
    email: vi.fn(async (_email: string) => {}),
    signOut: vi.fn(async () => {}),
    read: vi.fn(async () => remote),
    merge: vi.fn(async (_id: string, incoming: SyncSnapshot) => mergeGardenSnapshots(remote, incoming)),
  } satisfies AccountClient
  const account = createGardenAccount({ guest: guestStorage, persistence, client,
    clock: () => ({ updatedAt: '2026-10-17T00:00:00.000Z', changeId: 'change-1' }) })
  render(<App storage={guestStorage} account={account} />)
  return { account, client, guestStorage, persistence }
}

async function openAccount(user = userEvent.setup()) {
  await user.click(screen.getByText(/account & sync/i))
  return user
}

describe('account section in App', () => {
  it('keeps a signed-in guest garden local until consent, including after closing the section', async () => {
    const user = userEvent.setup()
    const f = setup()
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    expect(screen.getByText('Guest Friend')).toBeInTheDocument()
    expect(f.client.read).not.toHaveBeenCalled()
    expect(f.client.merge).not.toHaveBeenCalled()
    await user.click(screen.getByText(/account & sync/i))
    expect(f.client.merge).not.toHaveBeenCalled()
  })

  it('merges the local garden only after explicit consent and leaves the guest copy unchanged', async () => {
    const user = userEvent.setup()
    const f = setup()
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    await user.click(screen.getByRole('button', { name: /merge local garden & sync/i }))
    await waitFor(() => expect(f.client.merge).toHaveBeenCalledOnce())
    expect(f.client.merge.mock.calls[0][1].friends.map((entry) => entry.id)).toContain('guest-friend')
    expect(f.guestStorage.loadFriends()).toEqual([localFriend])
    expect(screen.getByText('Guest Friend')).toBeInTheDocument()
  })

  it('uses only remote garden on consent and returns to the untouched guest garden on sign-out', async () => {
    const user = userEvent.setup()
    const remote = recordGardenChanges(empty(), [remoteFriend], () => ({ updatedAt: '2026-02-01T00:00:00.000Z', changeId: 'remote-change' }))
    const f = setup({ remote })
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    await user.click(screen.getByRole('button', { name: /use account garden only/i }))
    await waitFor(() => expect(screen.getByText('Remote Friend')).toBeInTheDocument())
    expect(screen.queryByText('Guest Friend')).not.toBeInTheDocument()
    expect(f.client.merge.mock.calls[0][1].friends.map((entry) => entry.id)).not.toContain('guest-friend')
    await user.click(screen.getByRole('button', { name: /sign out & return to local garden/i }))
    await waitFor(() => expect(screen.getByText('Guest Friend')).toBeInTheDocument())
    expect(screen.queryByText('Remote Friend')).not.toBeInTheDocument()
    expect(f.guestStorage.loadFriends()).toEqual([localFriend])
  })

  it('offers Google and email sign-in without uploading the garden', async () => {
    const user = userEvent.setup()
    const f = setup({ signedIn: null })
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(f.client.google).toHaveBeenCalledOnce()
    await user.type(screen.getByLabelText(/sign in by email/i), 'person@example.invalid')
    await user.click(screen.getByRole('button', { name: /email a sign-in link/i }))
    expect(f.client.email).toHaveBeenCalledWith('person@example.invalid')
    expect(await screen.findByText(/check your email for a sign-in link/i)).toBeInTheDocument()
    expect(f.client.merge).not.toHaveBeenCalled()
  })

  it('shows a generic sign-in error when sending the email link fails', async () => {
    const user = userEvent.setup()
    const f = setup({ signedIn: null })
    vi.mocked(f.client.email).mockRejectedValueOnce(new Error('secret transport detail'))
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    await user.type(screen.getByLabelText(/sign in by email/i), 'person@example.invalid')
    await user.click(screen.getByRole('button', { name: /email a sign-in link/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('Could not sign in. Please try again.')
    expect(screen.queryByText(/secret transport detail/i)).not.toBeInTheDocument()
    expect(f.client.merge).not.toHaveBeenCalled()
  })

  it('does not upload on account-storage quota failure and keeps the guest garden visible', async () => {
    const user = userEvent.setup()
    const f = setup({ saveAccount: () => { throw new DOMException('quota', 'QuotaExceededError') } })
    await waitFor(() => expect(f.client.session).toHaveBeenCalled())
    await openAccount(user)
    await user.click(screen.getByRole('button', { name: /merge local garden & sync/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not save or sync/i))
    expect(f.client.merge).not.toHaveBeenCalled()
    expect(screen.getByText('Guest Friend')).toBeInTheDocument()
  })

  it('keeps a new-friend draft and shows a generic error when local persistence fails', async () => {
    const user = userEvent.setup()
    const storage: GardenStorage = {
      loadFriends: () => [],
      saveFriends: () => { throw new Error('disk details') },
    }
    render(<App storage={storage} />)
    await user.click(screen.getByRole('button', { name: /add your first friend/i }))
    const nameInput = screen.getByLabelText(/what's their name/i)
    await user.type(nameInput, 'Draft Friend')
    await user.click(screen.getByRole('button', { name: /add to garden/i }))
    expect(nameInput).toHaveValue('Draft Friend')
    expect(screen.queryByText('Draft Friend')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i)
    expect(screen.queryByText(/added/i)).not.toBeInTheDocument()
  })

  it('retains an edit draft if saving fails instead of closing it as successful', async () => {
    const user = userEvent.setup()
    render(<App storage={{ loadFriends: () => [localFriend], saveFriends: () => { throw new Error('quota') } }} />)
    await user.click(screen.getByRole('button', { name: /details for guest friend/i }))
    await user.click(screen.getByRole('button', { name: /edit details/i }))
    const input = screen.getByLabelText('name')
    await user.clear(input)
    await user.type(input, 'Unsaved draft')
    await user.click(screen.getByRole('button', { name: 'save' }))
    expect(input).toHaveValue('Unsaved draft')
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i)
  })

  it('retains a conversation note and does not show watered success if saving fails', async () => {
    const user = userEvent.setup()
    render(<App storage={{ loadFriends: () => [localFriend], saveFriends: () => { throw new Error('quota') } }} />)
    await user.click(screen.getByRole('button', { name: /water guest friend/i }))
    const note = screen.getByLabelText('Note')
    await user.type(note, 'Keep this draft')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(note).toHaveValue('Keep this draft')
    expect(screen.queryByText(/watered!/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i)
  })
})
