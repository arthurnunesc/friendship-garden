import type { Pool } from './authMigration.js'
import { InvalidSyncSnapshotError, mergeGardenSnapshots, type SyncSnapshot } from './gardenSync.ts'

export const MAX_GARDEN_BYTES = 1_048_576
export class GardenStorageLimitError extends Error {}

const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })

function assertOwner(userId: string): void {
  if (typeof userId !== 'string' || !userId.trim() || userId.includes('\0')) {
    throw new Error('Invalid garden owner.')
  }
}

function assertPostgresText(value: unknown): void {
  if (typeof value === 'string') {
    if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
      throw new InvalidSyncSnapshotError('Sync strings must contain valid PostgreSQL Unicode text.')
    }
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) assertPostgresText(entry)
  }
}

function encode(snapshot: SyncSnapshot): string {
  assertPostgresText(snapshot)
  const encoded = JSON.stringify(snapshot)
  if (Buffer.byteLength(encoded, 'utf8') > MAX_GARDEN_BYTES) throw new GardenStorageLimitError()
  return encoded
}

function storedSnapshot(value: unknown): SyncSnapshot {
  try {
    const snapshot = mergeGardenSnapshots(empty(), value)
    encode(snapshot)
    return snapshot
  } catch {
    // Stored corruption is an internal failure, not an invalid incoming request.
    throw new Error('Stored garden could not be read.')
  }
}

export function createGardenStore(pool: Pool) {
  return {
    async read(userId: string): Promise<SyncSnapshot> {
      assertOwner(userId)
      const client = await pool.connect()
      try {
        const result = await client.query<{ snapshot: unknown }>(
          'SELECT snapshot FROM public.gardens WHERE user_id = $1', [userId],
        )
        return result.rows[0] ? storedSnapshot(result.rows[0].snapshot) : empty()
      } finally {
        client.release()
      }
    },

    async merge(userId: string, incoming: unknown): Promise<SyncSnapshot> {
      assertOwner(userId)
      const parsed = mergeGardenSnapshots(empty(), incoming)
      encode(parsed)
      const client = await pool.connect()
      let transactionStarted = false
      let discard = false
      try {
        await client.query('BEGIN')
        transactionStarted = true
        await client.query("SET LOCAL lock_timeout = '5s'")
        await client.query("SET LOCAL statement_timeout = '5s'")
        await client.query(
          'INSERT INTO public.gardens (user_id, snapshot) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO NOTHING',
          [userId, JSON.stringify(empty())],
        )
        const current = await client.query<{ snapshot: unknown }>(
          'SELECT snapshot FROM public.gardens WHERE user_id = $1 FOR UPDATE', [userId],
        )
        if (!current.rows[0]) throw new Error('Garden transaction lost its owner row.')
        const merged = mergeGardenSnapshots(storedSnapshot(current.rows[0].snapshot), parsed)
        const encoded = encode(merged)
        await client.query('UPDATE public.gardens SET snapshot = $2::jsonb WHERE user_id = $1', [userId, encoded])
        await client.query('COMMIT')
        transactionStarted = false
        return merged
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query('ROLLBACK')
          } catch (rollbackError) {
            discard = true
            throw new AggregateError([error, rollbackError], 'Garden merge and rollback failed.')
          }
        }
        throw error
      } finally {
        client.release(discard)
      }
    },
  }
}
