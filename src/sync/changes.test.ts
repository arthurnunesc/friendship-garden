import { describe, expect, it, vi } from 'vitest'
import { recordGardenChanges } from '../../packages/garden-sync/src/changes'
import { InvalidSyncSnapshotError, type GardenFriend, type SyncSnapshot } from '../../packages/garden-sync/src/snapshot'

const date = '2025-01-01T00:00:00.000Z'
const friend = (overrides: Partial<GardenFriend> = {}): GardenFriend => ({
  id: 'f1', name: 'Ada', cadenceDays: 7, createdAt: date, interactions: [], ...overrides,
})
const clockAt = (updatedAt = date) => vi.fn(() => ({ updatedAt, changeId: 'device-1' }))
const empty: SyncSnapshot = { version: 1, friends: [], interactions: [] }

describe('recordGardenChanges', () => {
  it('copies input and is idempotent without calling the clock for unchanged records', () => {
    const input = [friend({ birthday: '1990-04-12', interactions: [{ id: 'i1', date }] })]
    const inputCopy = structuredClone(input)
    const clock = clockAt()
    const first = recordGardenChanges(empty, input, clock)
    expect(input).toEqual(inputCopy)
    const unusedClock = clockAt()
    expect(recordGardenChanges(first, input, unusedClock)).toEqual(first)
    expect(unusedClock).not.toHaveBeenCalled()
    expect(clock).toHaveBeenCalledTimes(2)
  })

  it('does not bump interaction versions for friend edits or friend versions for interaction additions', () => {
    const initial = recordGardenChanges(empty, [friend({ interactions: [{ id: 'i1', date }] })], clockAt())
    const changedFriend = recordGardenChanges(initial, [friend({ name: 'Ada Lovelace', interactions: [{ id: 'i1', date }] })], clockAt())
    expect(changedFriend.interactions).toEqual(initial.interactions)
    const addedInteraction = recordGardenChanges(changedFriend, [friend({ name: 'Ada Lovelace', interactions: [{ id: 'i1', date }, { id: 'i2', date }] })], clockAt())
    expect(addedInteraction.friends).toEqual(changedFriend.friends)
  })

  it('tombstones deleted friends and interactions, and retains tombstones on stale retries', () => {
    const initial = recordGardenChanges(empty, [friend({ interactions: [{ id: 'i1', date }] })], clockAt())
    const removed = recordGardenChanges(initial, [], clockAt('2025-01-02T00:00:00.000Z'))
    expect(removed.friends[0]).toMatchObject({ id: 'f1', deleted: true })
    expect(removed.interactions[0]).toMatchObject({ id: 'i1', deleted: true })
    expect(recordGardenChanges(removed, [], clockAt())).toEqual(removed)
  })

  it('gives re-added deleted records a monotonic version despite a clock rollback', () => {
    const initial = recordGardenChanges(empty, [friend()], clockAt())
    const removed = recordGardenChanges(initial, [], clockAt('2025-01-02T00:00:00.000Z'))
    const restored = recordGardenChanges(removed, [friend()], clockAt())
    expect(restored.friends[0]).toMatchObject({ deleted: false, updatedAt: '2025-01-02T00:00:00.001Z' })
  })

  it('preserves a later legacy lastInteractionAt as a deterministic synthetic interaction', () => {
    const result = recordGardenChanges(empty, [friend({ lastInteractionAt: '2025-02-01T00:00:00.000Z' })], clockAt())
    expect(result.interactions[0]).toMatchObject({ id: 'legacy-last-2025-02-01T00:00:00.000Z', value: { date: '2025-02-01T00:00:00.000Z' } })
  })

  it('does not delete an unseen orphan interaction before its friend record arrives', () => {
    const previous: SyncSnapshot = { ...empty, interactions: [{
      friendId: 'not-yet-received', id: 'interaction', deleted: false,
      updatedAt: date, changeId: 'remote-change', value: { date },
    }] }
    const clock = clockAt()
    expect(recordGardenChanges(previous, [], clock)).toEqual(previous)
    expect(clock).not.toHaveBeenCalled()
  })

  it('rejects duplicate identities and invalid previous snapshots or clocks', () => {
    expect(() => recordGardenChanges(empty, [friend(), friend()], clockAt())).toThrow(InvalidSyncSnapshotError)
    expect(() => recordGardenChanges(empty, [friend({ interactions: [{ id: 'i', date }, { id: 'i', date }] })], clockAt())).toThrow(InvalidSyncSnapshotError)
    expect(() => recordGardenChanges({ ...empty, friends: [{ id: 'f', updatedAt: 'bad', changeId: 'x', deleted: true }] } as SyncSnapshot, [], clockAt())).toThrow(InvalidSyncSnapshotError)
    expect(() => recordGardenChanges(empty, [friend()], clockAt('not-a-date'))).toThrow(InvalidSyncSnapshotError)
  })
})
