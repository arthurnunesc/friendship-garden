import { describe, it, expect } from 'vitest'
import { createFriend, logInteraction, DEFAULT_CADENCE_DAYS } from './Friend'
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
