import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Friend } from './friends/Friend'
import type { GardenStorage } from './friends/storage'

function createFakeStorage(initial: Friend[] = []): GardenStorage {
  let data = initial
  return {
    loadFriends: () => data,
    saveFriends: (friends) => {
      data = [...friends]
    },
  }
}

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />)
    expect(screen.getByText('Friendship Garden')).toBeInTheDocument()
  })

  describe('empty garden', () => {
    it('explains the garden starts empty and private', () => {
      render(<App />)
      expect(
        screen.getByText(/your garden starts empty/i),
      ).toBeInTheDocument()
    })

    it('shows the primary action to add a friend', () => {
      render(<App />)
      expect(
        screen.getByRole('button', { name: /add your first friend/i }),
      ).toBeInTheDocument()
    })

    it('does not use guilt-heavy, punitive, or surveillance language', () => {
      render(<App />)
      const copy = document.body.textContent?.toLowerCase() ?? ''
      const forbidden = [
        'neglect',
        'failing',
        'shame',
        'guilty',
        'track',
        'monitor',
        'surveillance',
        'crm',
        'contact manager',
      ]
      forbidden.forEach((phrase) => {
        expect(copy).not.toContain(phrase)
      })
    })
  })

  describe('adding a friend', () => {
    it('adds a friend and shows them in the garden', async () => {
      const user = userEvent.setup()
      render(<App storage={createFakeStorage()} />)

      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.type(screen.getByLabelText(/what's their name/i), 'Alice')
      await user.click(screen.getByRole('button', { name: /add to garden/i }))

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.queryByText(/your garden starts empty/i)).toBeNull()
    })

    it('does not add a friend with an empty name', async () => {
      const user = userEvent.setup()
      render(<App storage={createFakeStorage()} />)

      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )

      const submitButton = screen.getByRole('button', {
        name: /add to garden/i,
      })
      expect(submitButton).toBeDisabled()
    })

    it('cancels adding and returns to empty state', async () => {
      const user = userEvent.setup()
      render(<App storage={createFakeStorage()} />)

      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(
        screen.getByRole('button', { name: /add your first friend/i }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/what's their name/i),
      ).toBeNull()
    })
  })

  describe('persistence', () => {
    it('loads persisted friends on mount', () => {
      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(
        screen.queryByText(/your garden starts empty/i),
      ).toBeNull()
    })

    it('saves new friends to storage', async () => {
      const user = userEvent.setup()
      let saved: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [],
        saveFriends: (friends) => {
          saved = [...friends]
        },
      }

      render(<App storage={storage} />)
      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.type(screen.getByLabelText(/what's their name/i), 'Bob')
      await user.click(screen.getByRole('button', { name: /add to garden/i }))

      expect(saved).toHaveLength(1)
      expect(saved[0].name).toBe('Bob')
    })
  })

  describe('optional fields', () => {
    it('shows optional details when expanded', async () => {
      const user = userEvent.setup()
      render(<App storage={createFakeStorage()} />)

      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )

      const summary = screen.getByText(/more details/i)
      await user.click(summary)

      expect(
        screen.getByLabelText('Birthday'),
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText('Contact cadence'),
      ).toBeInTheDocument()
    })

    it('defaults cadence to 14 days when not changed', async () => {
      const user = userEvent.setup()
      const friends: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [],
        saveFriends: (f) => {
          friends.splice(0, friends.length, ...f)
        },
      }

      render(<App storage={storage} />)
      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.type(screen.getByLabelText(/what's their name/i), 'Alice')
      await user.click(screen.getByRole('button', { name: /add to garden/i }))

      expect(friends[0].cadenceDays).toBe(14)
    })

    it('records a custom cadence when selected', async () => {
      const user = userEvent.setup()
      const friends: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [],
        saveFriends: (f) => {
          friends.splice(0, friends.length, ...f)
        },
      }

      render(<App storage={storage} />)
      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.type(screen.getByLabelText(/what's their name/i), 'Alice')
      await user.click(screen.getByText(/more details/i))
      await user.selectOptions(
        screen.getByLabelText('Contact cadence'),
        '7',
      )
      await user.click(screen.getByRole('button', { name: /add to garden/i }))

      expect(friends[0].cadenceDays).toBe(7)
    })

    it('records an optional birthday when provided', async () => {
      const user = userEvent.setup()
      const friends: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [],
        saveFriends: (f) => {
          friends.splice(0, friends.length, ...f)
        },
      }

      render(<App storage={storage} />)
      await user.click(
        screen.getByRole('button', { name: /add your first friend/i }),
      )
      await user.type(screen.getByLabelText(/what's their name/i), 'Alice')
      await user.click(screen.getByText(/more details/i))
      const dateInput = screen.getByLabelText('Birthday')
      await user.clear(dateInput)
      await user.type(dateInput, '1990-05-14')
      await user.click(screen.getByRole('button', { name: /add to garden/i }))

      expect(friends[0].birthday).toBe('1990-05-14')
    })
  })
})
