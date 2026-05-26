import { describe, it, expect } from 'vitest'
import { createFriend } from './Friend'

describe('createFriend', () => {
  it('creates a friend with a unique id', () => {
    const alice = createFriend('Alice')
    const bob = createFriend('Bob')

    expect(alice.id).toMatch(/^friend-/)
    expect(bob.id).toMatch(/^friend-/)
    expect(alice.id).not.toBe(bob.id)
  })

  it('trims whitespace from the name', () => {
    const friend = createFriend('  Alice  ')
    expect(friend.name).toBe('Alice')
  })

  it('sets createdAt to an ISO string', () => {
    const friend = createFriend('Alice')
    expect(friend.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    )
  })
})
