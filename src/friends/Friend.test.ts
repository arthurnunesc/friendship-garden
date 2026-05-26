import { describe, it, expect } from 'vitest'
import { createFriend, logInteraction, deriveWateringState, sortFriendsByUrgency, DEFAULT_CADENCE_DAYS } from './Friend'
import type { Friend } from './Friend'

describe('createFriend', () => {
  it('creates a friend with a unique id', () => {
    const alice = createFriend({ name: 'Alice' })
    const bob = createFriend({ name: 'Bob' })

    expect(alice.id).toMatch(/^friend-/)
    expect(bob.id).toMatch(/^friend-/)
    expect(alice.id).not.toBe(bob.id)
  })

  it('trims whitespace from the name', () => {
    const friend = createFriend({ name: '  Alice  ' })
    expect(friend.name).toBe('Alice')
  })

  it('sets createdAt to an ISO string', () => {
    const friend = createFriend({ name: 'Alice' })
    expect(friend.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    )
  })

  it('initializes with no lastInteractionAt and empty interactions', () => {
    const friend = createFriend({ name: 'Alice' })
    expect(friend.lastInteractionAt).toBeUndefined()
    expect(friend.interactions).toEqual([])
  })

  describe('cadence', () => {
    it('defaults to 14 days when not provided', () => {
      const friend = createFriend({ name: 'Alice' })
      expect(friend.cadenceDays).toBe(DEFAULT_CADENCE_DAYS)
    })

    it('records a custom cadence when provided', () => {
      const friend = createFriend({ name: 'Alice', cadenceDays: 7 })
      expect(friend.cadenceDays).toBe(7)
    })
  })

  describe('birthday', () => {
    it('is undefined when not provided', () => {
      const friend = createFriend({ name: 'Alice' })
      expect(friend.birthday).toBeUndefined()
    })

    it('is stored when provided', () => {
      const friend = createFriend({ name: 'Alice', birthday: '1990-05-14' })
      expect(friend.birthday).toBe('1990-05-14')
    })
  })
})

describe('logInteraction', () => {
  it('sets lastInteractionAt to the current date', () => {
    const friend = createFriend({ name: 'Alice' })
    const updated = logInteraction(friend)

    expect(updated.lastInteractionAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    )
  })

  it('appends an interaction record', () => {
    const friend = createFriend({ name: 'Alice' })
    const updated = logInteraction(friend)

    expect(updated.interactions).toHaveLength(1)
    expect(updated.interactions[0].id).toMatch(/^int-/)
    expect(updated.interactions[0].date).toBe(updated.lastInteractionAt)
  })

  it('does not mutate the original friend', () => {
    const friend = createFriend({ name: 'Alice' })
    const updated = logInteraction(friend)

    expect(friend.lastInteractionAt).toBeUndefined()
    expect(friend.interactions).toEqual([])
    expect(updated).not.toBe(friend)
  })

  it('accumulates multiple interactions', () => {
    let friend: Friend = createFriend({ name: 'Alice' })
    friend = logInteraction(friend)
    friend = logInteraction(friend)

    expect(friend.interactions).toHaveLength(2)
  })

  describe('optional metadata', () => {
    it('works without type or note', () => {
      const friend = createFriend({ name: 'Alice' })
      const updated = logInteraction(friend)

      expect(updated.interactions[0].type).toBeUndefined()
      expect(updated.interactions[0].note).toBeUndefined()
    })

    it('stores interaction type when provided', () => {
      const friend = createFriend({ name: 'Alice' })
      const updated = logInteraction(friend, { type: 'call' })

      expect(updated.interactions[0].type).toBe('call')
    })

    it('stores note when provided', () => {
      const friend = createFriend({ name: 'Alice' })
      const updated = logInteraction(friend, { note: 'Great chat!' })

      expect(updated.interactions[0].note).toBe('Great chat!')
    })

    it('stores both type and note together', () => {
      const friend = createFriend({ name: 'Alice' })
      const updated = logInteraction(friend, {
        type: 'in-person',
        note: 'Coffee downtown',
      })

      expect(updated.interactions[0].type).toBe('in-person')
      expect(updated.interactions[0].note).toBe('Coffee downtown')
    })
  })
})

describe('deriveWateringState', () => {
  const now = new Date('2025-06-01T12:00:00Z')

  it('returns dry when friend has never been contacted', () => {
    const friend = createFriend({ name: 'Alice' })
    expect(deriveWateringState(friend, now)).toBe('dry')
  })

  it('returns watered when last contact is within cadence', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 14 }),
      lastInteractionAt: '2025-05-30T12:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('watered')
  })

  it('returns watered exactly at a cadence boundary under 14 days', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 14 }),
      lastInteractionAt: '2025-05-18T12:00:01Z',
    }
    expect(deriveWateringState(friend, now)).toBe('watered')
  })

  it('returns nearing when just past cadence', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 14 }),
      lastInteractionAt: '2025-05-18T12:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('nearing')
  })

  it('returns nearing at the top of the nearing window', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 14 }),
      lastInteractionAt: '2025-05-12T00:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('nearing')
  })

  it('returns dry when past the nearing window', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 14 }),
      lastInteractionAt: '2025-05-10T12:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('dry')
  })

  it('respects custom cadence values', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 7 }),
      lastInteractionAt: '2025-05-31T12:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('watered')
  })

  it('custom cadence nearing window respects shorter cadence', () => {
    const friend = {
      ...createFriend({ name: 'Alice', cadenceDays: 7 }),
      lastInteractionAt: '2025-05-23T12:00:00Z',
    }
    expect(deriveWateringState(friend, now)).toBe('nearing')
  })
})

describe('sortFriendsByUrgency', () => {
  const now = new Date('2025-06-01T12:00:00Z')

  it('puts dry friends before nearing, then watered', () => {
    const dry = { ...createFriend({ name: 'Dry' }), lastInteractionAt: '2025-05-10T12:00:00Z' }
    const nearing = { ...createFriend({ name: 'Nearing' }), lastInteractionAt: '2025-05-20T12:00:00Z', cadenceDays: 14 }
    const watered = { ...createFriend({ name: 'Watered' }), lastInteractionAt: '2025-05-31T00:00:00Z', cadenceDays: 14 }

    const sorted = sortFriendsByUrgency([watered, dry, nearing], now)
    expect(sorted.map((f) => f.name)).toEqual(['Dry', 'Nearing', 'Watered'])
  })

  it('orders friends within the same state by most days since contact', () => {
    const olderDry = { ...createFriend({ name: 'Oldest' }), lastInteractionAt: '2025-04-01T00:00:00Z' }
    const newerDry = { ...createFriend({ name: 'Newer' }), lastInteractionAt: '2025-05-10T00:00:00Z' }

    const sorted = sortFriendsByUrgency([newerDry, olderDry], now)
    expect(sorted.map((f) => f.name)).toEqual(['Oldest', 'Newer'])
  })

  it('does not mutate the original array', () => {
    const a = createFriend({ name: 'A' })
    const b = createFriend({ name: 'B' })
    const original = [b, a]
    sortFriendsByUrgency(original, now)
    expect(original[0].name).toBe('B')
    expect(original[1].name).toBe('A')
  })

  it('stale friends still appear in the sorted list', () => {
    const stale = {
      ...createFriend({ name: 'Stale' }),
      lastInteractionAt: '2024-01-01T00:00:00Z',
    }
    const sorted = sortFriendsByUrgency([stale], now)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].name).toBe('Stale')
  })
})
