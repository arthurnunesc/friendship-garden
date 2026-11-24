import { describe, expect, it } from 'vitest'
import { createGardenStore, GardenStorageLimitError, MAX_GARDEN_BYTES } from './gardenStore.js'
import { InvalidSyncSnapshotError, SyncCollisionError, type SyncSnapshot } from './gardenSync.js'
import type { Pool } from './authMigration.js'

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
const friend = (id = 'friend', name = 'Ada'): SyncSnapshot => ({
  version: 1, interactions: [], friends: [{
    id, updatedAt: '2026-10-01T00:00:00.000Z', changeId: 'change-1', deleted: false,
    value: { name, cadenceDays: 7, createdAt: '2026-01-01T00:00:00.000Z' },
  }],
})

function fakePool(initial?: unknown, fail?: string, failRollback = false) {
  let stored = initial
  let beforeTransaction: unknown
  const queries: { text: string, values?: readonly unknown[] }[] = []
  let connects = 0
  let releases = 0
  let destroyed = false
  const pool: Pool = {
    connect: async () => {
      connects += 1
      return {
        query: async <Row>(text: string, values?: readonly unknown[]) => {
          queries.push({ text, values })
          if (text === fail || (text === 'ROLLBACK' && failRollback)) throw new Error('synthetic query failure')
          if (text === 'BEGIN') beforeTransaction = stored
          if (text.startsWith('INSERT INTO public.gardens') && stored === undefined) stored = empty()
          if (text.startsWith('UPDATE')) stored = JSON.parse(String(values?.[1])) as unknown
          if (text === 'ROLLBACK') stored = beforeTransaction
          return { rows: (text.startsWith('SELECT snapshot') && stored !== undefined ? [{ snapshot: stored }] : []) as Row[] }
        },
        release: (destroy) => { releases += 1; destroyed = destroy === true },
      }
    },
  }
  return { pool, queries, get stored() { return stored }, get connects() { return connects },
    get releases() { return releases }, get destroyed() { return destroyed } }
}

describe('account garden PostgreSQL storage', () => {
  it('returns an empty garden without creating a row and always releases the reader', async () => {
    const f = fakePool()
    expect(await createGardenStore(f.pool).read('owner')).toEqual(empty())
    expect(f.queries).toEqual([{ text: 'SELECT snapshot FROM public.gardens WHERE user_id = $1', values: ['owner'] }])
    expect(f.stored).toBeUndefined()
    expect(f.releases).toBe(1)
  })

  it('canonicalizes stored data and returns a copy', async () => {
    const current = { ...friend(), extra: 'discard' }
    const f = fakePool(current)
    const result = await createGardenStore(f.pool).read('owner')
    expect(result).toEqual(friend())
    expect(result).not.toBe(current)
    expect(result.friends[0]).not.toBe(current.friends[0])
  })

  it.each(['', ' ', '\0', undefined])('rejects invalid owner %j without connecting', async (userId) => {
    const f = fakePool()
    const store = createGardenStore(f.pool)
    await expect(store.read(userId as string)).rejects.toThrow('owner')
    await expect(store.merge(userId as string, empty())).rejects.toThrow('owner')
    expect(f.connects).toBe(0)
  })

  it('rejects invalid or oversized incoming snapshots before connecting', async () => {
    const f = fakePool()
    const store = createGardenStore(f.pool)
    await expect(store.merge('owner', {})).rejects.toBeInstanceOf(InvalidSyncSnapshotError)
    await expect(store.merge('owner', friend('huge', 'é'.repeat(MAX_GARDEN_BYTES / 2)))).rejects.toBeInstanceOf(GardenStorageLimitError)
    expect(f.connects).toBe(0)
  })

  it.each(['\0', '\ud800', '\udfff'])('rejects text PostgreSQL JSONB cannot store: %j', async (name) => {
    const f = fakePool()
    await expect(createGardenStore(f.pool).merge('owner', friend('friend', name))).rejects.toBeInstanceOf(InvalidSyncSnapshotError)
    expect(f.connects).toBe(0)
  })

  it('supports valid Unicode and literal backslash escapes', async () => {
    const f = fakePool()
    const incoming = friend('🌻', 'Ada 🌷 literal \\u0000')
    expect(await createGardenStore(f.pool).merge('owner', incoming)).toEqual(incoming)
  })

  it('serializes initial writes with insert + row lock, and uses bound owner parameters throughout', async () => {
    const f = fakePool()
    const owner = "owner'); DROP TABLE gardens; --"
    expect(await createGardenStore(f.pool).merge(owner, friend())).toEqual(friend())
    expect(f.queries.map((query) => query.text)).toEqual([
      'BEGIN', "SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '5s'",
      'INSERT INTO public.gardens (user_id, snapshot) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO NOTHING',
      'SELECT snapshot FROM public.gardens WHERE user_id = $1 FOR UPDATE',
      'UPDATE public.gardens SET snapshot = $2::jsonb WHERE user_id = $1', 'COMMIT',
    ])
    for (const query of f.queries.filter((q) => q.text.includes('public.gardens'))) {
      expect(query.values?.[0]).toBe(owner)
      expect(query.text).not.toContain(owner)
    }
    expect(f.releases).toBe(1)
    expect(f.destroyed).toBe(false)
  })

  it('merges omissions, independent edits, tombstones, and idempotent retries without deleting history', async () => {
    const f = fakePool(friend('first'))
    const store = createGardenStore(f.pool)
    const combined = await store.merge('owner', friend('second'))
    expect(combined.friends.map((record) => record.id)).toEqual(['first', 'second'])
    const deleted: SyncSnapshot = { ...empty(), friends: [{
      id: 'first', deleted: true, updatedAt: '2026-10-02T00:00:00.000Z', changeId: 'delete',
    }] }
    const merged = await store.merge('owner', deleted)
    expect(merged.friends[0]?.deleted).toBe(true)
    expect(await store.merge('owner', friend('first'))).toEqual(merged)
    expect(await store.merge('owner', empty())).toEqual(merged)
  })

  it('rolls back a version collision without writing or leaking stored data in the error', async () => {
    const original = friend()
    const f = fakePool(original)
    await expect(createGardenStore(f.pool).merge('owner', friend('friend', 'different'))).rejects.toBeInstanceOf(SyncCollisionError)
    expect(f.queries.some((query) => query.text.startsWith('UPDATE'))).toBe(false)
    expect(f.queries.at(-1)?.text).toBe('ROLLBACK')
    expect(f.stored).toEqual(original)
    expect(f.releases).toBe(1)
  })

  it('rolls back aggregate quota overflow even when each incoming snapshot fits', async () => {
    const original = friend('one', 'x'.repeat(MAX_GARDEN_BYTES * 0.6))
    const f = fakePool(original)
    await expect(createGardenStore(f.pool).merge('owner', friend('two', 'x'.repeat(MAX_GARDEN_BYTES * 0.6))))
      .rejects.toBeInstanceOf(GardenStorageLimitError)
    expect(f.stored).toEqual(original)
    expect(f.queries.at(-1)?.text).toBe('ROLLBACK')
  })

  it('treats corrupt stored snapshots as internal errors, not incoming validation errors', async () => {
    const f = fakePool({ version: 99 })
    const store = createGardenStore(f.pool)
    await expect(store.read('owner')).rejects.not.toBeInstanceOf(InvalidSyncSnapshotError)
    await expect(store.merge('owner', empty())).rejects.toThrow('Stored garden')
    expect(f.queries.at(-1)?.text).toBe('ROLLBACK')
    expect(f.releases).toBe(2)
  })

  it('releases a failed read and a failed BEGIN without trying to roll back an unstarted transaction', async () => {
    const reader = fakePool(undefined, 'SELECT snapshot FROM public.gardens WHERE user_id = $1')
    await expect(createGardenStore(reader.pool).read('owner')).rejects.toThrow()
    expect(reader.releases).toBe(1)
    const writer = fakePool(undefined, 'BEGIN')
    await expect(createGardenStore(writer.pool).merge('owner', empty())).rejects.toThrow()
    expect(writer.queries.map((query) => query.text)).toEqual(['BEGIN'])
    expect(writer.releases).toBe(1)
  })

  it('destroys the connection when rollback fails and retains both errors', async () => {
    const f = fakePool(friend(), 'UPDATE public.gardens SET snapshot = $2::jsonb WHERE user_id = $1', true)
    await expect(createGardenStore(f.pool).merge('owner', empty())).rejects.toBeInstanceOf(AggregateError)
    expect(f.releases).toBe(1)
    expect(f.destroyed).toBe(true)
  })
})
