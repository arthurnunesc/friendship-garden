import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
          interactions: [],
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

  describe('garden list', () => {
    it('shows the friend count in the garden label', () => {
      const persisted: Friend[] = Array.from({ length: 3 }, (_, i) => ({
        id: `f-${i}`,
        name: `Friend ${i + 1}`,
        cadenceDays: 14,
        interactions: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      }))
      render(<App storage={createFakeStorage(persisted)} />)

      expect(screen.getByText(/your garden \(3\)/i)).toBeInTheDocument()
    })

    it('renders 25 friends and keeps the add button visible', () => {
      const persisted: Friend[] = Array.from({ length: 25 }, (_, i) => ({
        id: `f-${i}`,
        name: `Friend ${i + 1}`,
        cadenceDays: 14,
        interactions: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      }))
      render(<App storage={createFakeStorage(persisted)} />)

      // All 25 names should be in the document
      persisted.forEach((f) => {
        expect(screen.getByText(f.name)).toBeInTheDocument()
      })

      // The add button should still be present
      expect(
        screen.getByRole('button', { name: /add a friend/i }),
      ).toBeInTheDocument()
    })

    it('does not add search, filtering, or grouping UI', () => {
      render(<App storage={createFakeStorage([])} />)

      expect(screen.queryByPlaceholderText(/search/i)).toBeNull()
      expect(screen.queryByPlaceholderText(/filter/i)).toBeNull()
      expect(screen.queryByRole('combobox', { name: /group/i })).toBeNull()
      expect(screen.queryByRole('combobox', { name: /sort/i })).toBeNull()
    })
  })

  describe('watering', () => {
    it('logs a conversation and updates lastInteractionAt', async () => {
      const user = userEvent.setup()
      let saved: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [
          {
            id: 'f-1',
            name: 'Alice',
            cadenceDays: 14,
            interactions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        saveFriends: (f) => {
          saved = [...f]
        },
      }

      render(<App storage={storage} />)
      await user.click(
        screen.getByRole('button', { name: /water alice/i }),
      )

      expect(saved).toHaveLength(1)
      expect(saved[0].lastInteractionAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      )
      expect(saved[0].interactions).toHaveLength(1)
    })

    it('shows a water button for each friend', () => {
      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          interactions: [],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'f-2',
          name: 'Bob',
          cadenceDays: 14,
          interactions: [],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      expect(
        screen.getByRole('button', { name: /water alice/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /water bob/i }),
      ).toBeInTheDocument()
    })

    it('any meaningful interaction counts as watering', async () => {
      const user = userEvent.setup()
      let saved: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [
          {
            id: 'f-1',
            name: 'Alice',
            cadenceDays: 14,
            interactions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        saveFriends: (f) => {
          saved = [...f]
        },
      }

      render(<App storage={storage} />)

      // Water twice — any interaction counts
      await user.click(
        screen.getByRole('button', { name: /water alice/i }),
      )
      await user.click(
        screen.getByRole('button', { name: /water alice/i }),
      )

      expect(saved[0].interactions).toHaveLength(2)
    })

    it('logs with optional type and note', async () => {
      const user = userEvent.setup()
      let saved: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [
          {
            id: 'f-1',
            name: 'Alice',
            cadenceDays: 14,
            interactions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        saveFriends: (f) => {
          saved = [...f]
        },
      }

      render(<App storage={storage} />)

      // Expand details
      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )
      // Select type
      await user.selectOptions(
        screen.getByLabelText('Interaction type'),
        'call',
      )
      // Add note
      await user.type(
        screen.getByLabelText('Note'),
        'Great chat!',
      )
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(saved[0].interactions[0].type).toBe('call')
      expect(saved[0].interactions[0].note).toBe('Great chat!')
    })

    it('saves with empty optional fields just fine', async () => {
      const user = userEvent.setup()
      let saved: Friend[] = []
      const storage: GardenStorage = {
        loadFriends: () => [
          {
            id: 'f-1',
            name: 'Alice',
            cadenceDays: 14,
            interactions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        saveFriends: (f) => {
          saved = [...f]
        },
      }

      render(<App storage={storage} />)

      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )
      // Don't fill anything — just save
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(saved[0].interactions).toHaveLength(1)
      expect(saved[0].interactions[0].type).toBeUndefined()
      expect(saved[0].interactions[0].note).toBeUndefined()
    })
  })

  describe('history', () => {
    it('shows interaction history when expanded', async () => {
      const user = userEvent.setup()
      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          interactions: [
            {
              id: 'int-1',
              date: '2025-05-20T10:00:00.000Z',
              type: 'message',
              note: 'Funny meme',
            },
            {
              id: 'int-2',
              date: '2025-05-25T14:00:00.000Z',
              type: 'call',
            },
          ],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )

      expect(screen.getByText(/recent chats/i)).toBeInTheDocument()
      expect(screen.getByText(/funny meme/i)).toBeInTheDocument()
    })

    it('shows no history section when there are no interactions', async () => {
      const user = userEvent.setup()
      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          interactions: [],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )

      expect(screen.queryByText(/recent chats/i)).toBeNull()
    })

    it('shows history in newest-first order', async () => {
      const user = userEvent.setup()
      const older = new Date('2025-05-10T00:00:00Z').toISOString()
      const newer = new Date('2025-05-25T00:00:00Z').toISOString()

      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          interactions: [
            { id: 'int-1', date: older, type: 'message' as const, note: 'Old' },
            { id: 'int-2', date: newer, type: 'call' as const, note: 'New' },
          ],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )

      const items = screen.getAllByText(/^(Old|New)$/)
      expect(items[0]).toHaveTextContent('New')
      expect(items[1]).toHaveTextContent('Old')
    })

    it('shows type and note only when present', async () => {
      const user = userEvent.setup()
      const persisted: Friend[] = [
        {
          id: 'f-1',
          name: 'Alice',
          cadenceDays: 14,
          interactions: [
            { id: 'int-1', date: '2025-05-25T00:00:00.000Z', type: 'call' as const },
            { id: 'int-2', date: '2025-05-20T00:00:00.000Z' },
            { id: 'int-3', date: '2025-05-15T00:00:00.000Z', note: 'Just a note' },
          ],
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      render(<App storage={createFakeStorage(persisted)} />)

      await user.click(
        screen.getByRole('button', { name: /details for alice/i }),
      )

      // Type badge shows
      const historySection = screen.getByText(/recent chats/i).closest('.history')
      expect(historySection).toBeInTheDocument()
      expect(within(historySection as HTMLElement).getByText('Call')).toBeInTheDocument()
      // Note shows
      expect(within(historySection as HTMLElement).getByText('Just a note')).toBeInTheDocument()
      // Bare interaction renders without crashing
      expect(historySection!.querySelectorAll('.history-item')).toHaveLength(3)
    })
  })
})
