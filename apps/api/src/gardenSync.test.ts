import { describe, expect, it } from 'vitest'
import { materializeGarden, mergeGardenSnapshots } from './gardenSync.js'

const updatedAt = '2026-10-16T12:00:00.000Z'
const earlier = '2026-10-16T11:00:00.000Z'
const later = '2026-10-16T13:00:00.000Z'

function friend(overrides: Record<string, unknown> = {}) {
  return {
    id: 'friend-a',
    updatedAt,
    changeId: 'device-a:1',
    deleted: false,
    value: {
      name: 'Alex',
      birthday: '1990-02-28',
      cadenceDays: 14,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  }
}

function interaction(overrides: Record<string, unknown> = {}) {
  return {
    friendId: 'friend-a',
    id: 'interaction-a',
    updatedAt,
    changeId: 'device-a:2',
    deleted: false,
    value: {
      date: '2026-10-01T10:00:00.000Z',
      type: 'call',
      note: 'Caught up',
    },
    ...overrides,
  }
}

function snapshot(
  friends: unknown[] = [friend()],
  interactions: unknown[] = [],
  extra: Record<string, unknown> = {},
) {
  return { version: 1, friends, interactions, ...extra }
}

describe('mergeGardenSnapshots', () => {
  it('selects a newer friend edit regardless of arrival order', () => {
    const old = snapshot([friend({ updatedAt: earlier, changeId: 'device-a:1' })])
    const revised = snapshot([
      friend({
        updatedAt: later,
        changeId: 'device-b:4',
        value: {
          name: 'Alexandra',
          cadenceDays: 21,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    expect(mergeGardenSnapshots(old, revised).friends[0]?.value?.name).toBe('Alexandra')
    expect(mergeGardenSnapshots(revised, old)).toEqual(mergeGardenSnapshots(old, revised))
  })

  it('preserves independent interaction additions beside a concurrent friend edit', () => {
    const renamed = snapshot([
      friend({
        updatedAt: later,
        value: { name: 'Alexandra', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' },
      }),
    ])
    const logged = snapshot([friend()], [interaction()])

    expect(mergeGardenSnapshots(renamed, logged)).toEqual({
      version: 1,
      friends: [
        friend({
          updatedAt: later,
          value: { name: 'Alexandra', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' },
        }),
      ],
      interactions: [interaction()],
    })
  })

  it('preserves conversations independently added on two devices', () => {
    const left = snapshot([friend()], [interaction({ id: 'left' })])
    const right = snapshot([friend()], [interaction({ id: 'right' })])
    const merged = mergeGardenSnapshots(left, right)

    expect(materializeGarden(merged)[0]?.interactions.map(({ id }) => id)).toEqual(['left', 'right'])
    expect(mergeGardenSnapshots(right, left)).toEqual(merged)
  })

  it('treats friendId as part of an interaction identity', () => {
    const result = mergeGardenSnapshots(
      snapshot([], [interaction({ friendId: 'friend-a', id: 'shared' })]),
      snapshot([], [interaction({ friendId: 'friend-b', id: 'shared', changeId: 'device-b:1' })]),
    )

    expect(result.interactions.map(({ friendId, id }) => [friendId, id])).toEqual([
      ['friend-a', 'shared'],
      ['friend-b', 'shared'],
    ])
  })

  it('keeps newer friend and interaction tombstones against stale live records', () => {
    const live = snapshot([friend({ updatedAt: earlier })], [interaction({ updatedAt: earlier })])
    const deleted = snapshot(
      [{ id: 'friend-a', updatedAt: later, changeId: 'device-b:1', deleted: true }],
      [{ friendId: 'friend-a', id: 'interaction-a', updatedAt: later, changeId: 'device-b:2', deleted: true }],
    )

    const merged = mergeGardenSnapshots(live, deleted)
    expect(merged.friends[0]?.deleted).toBe(true)
    expect(merged.interactions[0]?.deleted).toBe(true)
    expect(materializeGarden(merged)).toEqual([])
  })

  it('uses deletion then code-point changeId ordering for equal-time conflicts', () => {
    const live = snapshot([friend({ changeId: 'z' })])
    const deleted = snapshot([{ id: 'friend-a', updatedAt, changeId: 'a', deleted: true }])
    const lower = snapshot([friend({ changeId: 'a' })])
    const higher = snapshot([friend({ changeId: '😀' })])

    expect(mergeGardenSnapshots(live, deleted).friends[0]?.deleted).toBe(true)
    expect(mergeGardenSnapshots(lower, higher).friends[0]?.changeId).toBe('😀')
  })

  it('orders supplementary Unicode code points independently of UTF-16 ordering', () => {
    const left = snapshot([friend({ changeId: '\ue000' })])
    const right = snapshot([friend({ changeId: '😀' })])

    expect(mergeGardenSnapshots(left, right).friends[0]?.changeId).toBe('😀')
    expect(mergeGardenSnapshots(right, left)).toEqual(mergeGardenSnapshots(left, right))
  })

  it('rejects same-version records with different canonical payloads', () => {
    const left = snapshot([friend()])
    const right = snapshot([
      friend({ value: { name: 'Different', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' } }),
    ])

    expect(() => mergeGardenSnapshots(left, right)).toThrow(/collision/i)
  })

  it('rejects reused interaction versions and accepts equivalent canonical payloads', () => {
    const left = snapshot([], [interaction()])
    const changed = snapshot([], [interaction({ value: { date: '2026-10-01T10:00:00.000Z', note: 'Different' } })])
    const equivalent = snapshot([], [interaction({
      ignored: true,
      value: { note: 'Caught up', type: 'call', date: '2026-10-01T10:00:00.000Z', extra: 'discard' },
    })])

    expect(() => mergeGardenSnapshots(left, changed)).toThrow(/collision/i)
    expect(() => mergeGardenSnapshots(changed, left)).toThrow(/collision/i)
    expect(mergeGardenSnapshots(left, equivalent)).toEqual(left)
  })

  it('rejects invalid schemas and values before returning a result', () => {
    const invalidSnapshots = [
      null,
      [],
      { version: 2, friends: [], interactions: [] },
      { version: 1, friends: [], interactions: null },
      snapshot([friend({ id: ' ' })]),
      snapshot([friend({ changeId: '' })]),
      snapshot([friend({ deleted: 'false' })]),
      snapshot([friend({ updatedAt: 'invalid' })]),
      snapshot([friend({ updatedAt: '2026-02-30T12:00:00.000Z' })]),
      snapshot([friend({ updatedAt: '2026-10-16T12:00:00Z' })]),
      snapshot([friend({ value: { name: ' ', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' } })]),
      snapshot([friend({ value: { name: 'Alex', cadenceDays: Number.MAX_SAFE_INTEGER + 1, createdAt: '2026-01-01T00:00:00.000Z' } })]),
      snapshot([friend({ value: { name: 'Alex', birthday: '2026-02-29', cadenceDays: 14, createdAt: '2026-01-01T00:00:00.000Z' } })]),
      snapshot([friend({ value: { name: 'Alex', cadenceDays: 0, createdAt: '2026-01-01T00:00:00.000Z' } })]),
      snapshot([], [interaction({ friendId: '' })]),
      snapshot([], [interaction({ value: { date: '2026-10-01', note: 'Invalid date' } })]),
      snapshot([], [interaction({ value: { date: '2026-10-01T10:00:00.000Z', note: 42 } })]),
      snapshot([], [interaction({ value: { date: '2026-10-01T10:00:00.000Z', type: 'email' } })]),
      snapshot([{ id: 'friend-a', updatedAt, changeId: 'd', deleted: true, value: { name: 'retained' } }]),
      snapshot([], [{ friendId: 'friend-a', id: 'i', updatedAt, changeId: 'd', deleted: true, value: { note: 'retained' } }]),
      snapshot([friend(), friend({ id: 'friend-a', changeId: 'device-b:1' })]),
      snapshot([], [interaction(), interaction({ changeId: 'device-b:2' })]),
    ]

    for (const invalid of invalidSnapshots) {
      expect(() => mergeGardenSnapshots(invalid, snapshot())).toThrow()
      expect(() => mergeGardenSnapshots(snapshot(), invalid)).toThrow()
      expect(() => materializeGarden(invalid)).toThrow()
    }
  })

  it('drops unknown fields and produces a stable identity-sorted snapshot', () => {
    const result = mergeGardenSnapshots(
      snapshot(
        [friend({ id: 'z', extra: 'discard' }), friend({ id: 'a', changeId: 'device-a:3' })],
        [interaction({ friendId: 'z', id: 'z', extra: true }), interaction({ friendId: 'a', id: 'b', changeId: 'device-a:4' })],
        { ignored: true },
      ),
      snapshot([], []),
    )

    expect(result).toEqual({
      version: 1,
      friends: [friend({ id: 'a', changeId: 'device-a:3' }), friend({ id: 'z' })],
      interactions: [interaction({ friendId: 'a', id: 'b', changeId: 'device-a:4' }), interaction({ friendId: 'z', id: 'z' })],
    })
  })

  it('is idempotent, commutative, and associative for valid snapshots', () => {
    const a = snapshot([friend({ updatedAt: earlier })])
    const b = snapshot([friend({ updatedAt: later, changeId: 'device-b:1' })], [interaction()])
    const c = snapshot([], [interaction({ id: 'interaction-b', changeId: 'device-c:1' })])

    expect(mergeGardenSnapshots(a, a)).toEqual(mergeGardenSnapshots(a, snapshot([], [])))
    expect(mergeGardenSnapshots(a, b)).toEqual(mergeGardenSnapshots(b, a))
    expect(mergeGardenSnapshots(mergeGardenSnapshots(a, b), c)).toEqual(
      mergeGardenSnapshots(a, mergeGardenSnapshots(b, c)),
    )
  })

  it('does not mutate or alias inputs or merged output', () => {
    const source = snapshot([friend()], [interaction()])
    const before = JSON.stringify(source)
    const freeze = (value: unknown): void => {
      if (value !== null && typeof value === 'object') {
        Object.values(value).forEach(freeze)
        Object.freeze(value)
      }
    }
    freeze(source)
    const result = mergeGardenSnapshots(source, snapshot())
    expect(JSON.stringify(source)).toBe(before)
    const resultFriend = result.friends[0] as { value: { name: string } }
    const resultInteraction = result.interactions[0] as { value: { note: string } }
    resultFriend.value.name = 'Changed'
    resultInteraction.value.note = 'Changed'

    expect((source.friends[0] as { value: { name: string } }).value.name).toBe('Alex')
    expect((source.interactions[0] as { value: { note: string } }).value.note).toBe('Caught up')
  })
})

describe('materializeGarden', () => {
  it('sorts materialized friends by identity', () => {
    expect(materializeGarden(snapshot([
      friend({ id: 'z', changeId: 'device-a:4' }),
      friend({ id: 'a', changeId: 'device-a:3' }),
    ]))).toMatchObject([{ id: 'a' }, { id: 'z' }])
  })

  it('returns the existing backup friend JSON shape with derived lastInteractionAt', () => {
    expect(materializeGarden(snapshot([friend()], [
      interaction({ id: 'later', value: { date: '2026-10-02T10:00:00.000Z', note: 'Later' } }),
      interaction({ id: 'first', value: { date: '2026-10-01T10:00:00.000Z', type: 'message' } }),
    ]))).toEqual([
      {
        id: 'friend-a',
        name: 'Alex',
        birthday: '1990-02-28',
        cadenceDays: 14,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastInteractionAt: '2026-10-02T10:00:00.000Z',
        interactions: [
          { id: 'first', date: '2026-10-01T10:00:00.000Z', type: 'message' },
          { id: 'later', date: '2026-10-02T10:00:00.000Z', note: 'Later' },
        ],
      },
    ])
  })

  it('hides orphaned and deleted-parent interactions but retains them in a merged snapshot', () => {
    const merged = mergeGardenSnapshots(
      snapshot([{ id: 'friend-a', updatedAt, changeId: 'd', deleted: true }], [interaction(), interaction({ friendId: 'missing', id: 'orphan' })]),
      snapshot(),
    )

    expect(merged.interactions).toHaveLength(2)
    expect(materializeGarden(merged)).toEqual([])
  })

  it('derives the last conversation only from live interactions, with stable equal-date ordering', () => {
    const garden = materializeGarden(snapshot([friend()], [
      interaction({ id: 'b' }),
      interaction({ id: 'a' }),
      { friendId: 'friend-a', id: 'deleted', updatedAt, changeId: 'd', deleted: true },
    ]))

    expect(garden[0]?.interactions.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(garden[0]?.lastInteractionAt).toBe('2026-10-01T10:00:00.000Z')
    expect(materializeGarden(snapshot())[0]).not.toHaveProperty('lastInteractionAt')
  })

  it('allows a genuinely newer live parent version under last-write-wins', () => {
    const deleted = snapshot([{ id: 'friend-a', updatedAt: earlier, changeId: 'd', deleted: true }])
    const revived = snapshot([friend({ updatedAt: later })])

    expect(materializeGarden(mergeGardenSnapshots(deleted, revived))[0]?.name).toBe('Alex')
  })

  it('does not alias materialized nested values or derive dates from mutable input values', () => {
    const source = snapshot([friend()], [interaction()])
    const garden = materializeGarden(source)
    garden[0]?.interactions[0] && (garden[0].interactions[0].note = 'Changed')

    expect((source.interactions[0] as { value: { note: string } }).value.note).toBe('Caught up')
    expect(garden[0]?.lastInteractionAt).toBe('2026-10-01T10:00:00.000Z')
  })
})
