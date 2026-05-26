import { describe, it, expect } from 'vitest'
import { createFriend, DEFAULT_CADENCE_DAYS } from './Friend'

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
