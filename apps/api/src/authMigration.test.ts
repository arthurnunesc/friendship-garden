import { describe, expect, it } from 'vitest'
import { applyAuthMigration, type Pool } from './authMigration.js'

type Query = { text: string, values?: readonly unknown[] }

function fakePool(responses: Array<{ rows?: unknown[], error?: Error }> = []) {
  const transcript: Query[] = []
  const client = {
    query: async <Row>(text: string, values?: readonly unknown[]) => {
      transcript.push({ text, values })
      const response = responses.shift()
      if (response?.error) throw response.error
      return { rows: (response?.rows ?? []) as Row[] }
    },
    release: (destroy?: boolean) => { released += 1; destroyed = destroy === true },
  }
  let connects = 0
  let released = 0
  let destroyed = false
  const pool: Pool = {
    connect: async () => {
      connects += 1
      return client
    },
  }
  return { pool, transcript, get connects() { return connects }, get released() { return released }, get destroyed() { return destroyed } }
}

const target = { purpose: 'development' as const, host: 'ep-garden.us-east-2.aws.neon.tech', database: 'garden' }
const directURL = 'postgresql://user:password@ep-garden.us-east-2.aws.neon.tech/garden'
const pooledURL = 'postgresql://user:password@ep-garden-pooler.us-east-2.aws.neon.tech/garden'
const sql = 'CREATE TABLE public.example (id integer);'

describe('applyAuthMigration', () => {
  it('rejects non-development or mismatched targets before connecting', async () => {
    const fake = fakePool()

    await expect(applyAuthMigration(fake.pool, {
      databaseURL: 'postgresql://user:password@other.example/garden', target, sql,
    })).rejects.toThrow('does not match')
    await expect(applyAuthMigration(fake.pool, {
      databaseURL: directURL, target: { ...target, purpose: 'production' } as never, sql,
    })).rejects.toThrow('development')

    expect(fake.connects).toBe(0)
  })

  it('accepts direct and pooled development URLs', async () => {
    for (const databaseURL of [directURL, pooledURL]) {
      const fake = fakePool([{}, {}, {}, {}, {}, {}])

      await expect(applyAuthMigration(fake.pool, { databaseURL, target, sql })).resolves.toMatchObject({
        status: 'applied', version: '0001_auth',
      })
      expect(fake.connects).toBe(1)
    }
  })

  it.each([
    'https://ep-garden.us-east-2.aws.neon.tech/garden',
    directURL.replace('/garden', '/other-database'),
    directURL + '?schema=other',
    directURL + '?search_path=other',
    directURL + '?options=-c%20search_path%3Dother',
    directURL.replace('/garden', ':6543/garden'),
  ])('rejects unsafe migration URL before connecting: %s', async (databaseURL) => {
    const fake = fakePool()
    await expect(applyAuthMigration(fake.pool, { databaseURL, target, sql })).rejects.toThrow()
    expect(fake.connects).toBe(0)
  })

  it('applies once and rejects a changed checksum for the same version', async () => {
    const applied = fakePool([{}, {}, {}, { rows: [] }, {}, {}])

    await expect(applyAuthMigration(applied.pool, { databaseURL: directURL, target, sql })).resolves.toEqual({
      status: 'applied', version: '0001_auth',
    })
    expect(applied.transcript.map(({ text }) => text)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      'SET LOCAL search_path TO public',
      expect.stringContaining('CREATE TABLE IF NOT EXISTS public.friendship_garden_migrations'),
      'SELECT checksum FROM public.friendship_garden_migrations WHERE version = $1',
      sql,
      'INSERT INTO public.friendship_garden_migrations (version, checksum) VALUES ($1, $2)',
      'COMMIT',
    ])

    const alreadyApplied = fakePool([{}, {}, {}, {}, {
      rows: [{ checksum: 'f86ee6037ced9d0acecb4baf12c920067fc2081bfdb3bc92e412681fc283407e' }],
    }, {}])
    await expect(applyAuthMigration(alreadyApplied.pool, { databaseURL: directURL, target, sql })).resolves.toEqual({
      status: 'already-applied', version: '0001_auth',
    })
    expect(alreadyApplied.transcript.map(({ text }) => text)).not.toContain(sql)

    const changed = fakePool([{}, {}, {}, {}, { rows: [{ checksum: 'different' }] }])
    await expect(applyAuthMigration(changed.pool, { databaseURL: directURL, target, sql })).rejects.toThrow('checksum')
    expect(changed.transcript.at(-1)?.text).toBe('ROLLBACK')
  })

  it('rolls back and releases the connection when migration SQL fails', async () => {
    const ddlFailure = new Error('DDL failed')
    const fake = fakePool([{}, {}, {}, {}, { rows: [] }, { error: ddlFailure }])

    await expect(applyAuthMigration(fake.pool, { databaseURL: directURL, target, sql })).rejects.toBe(ddlFailure)
    expect(fake.transcript.at(-1)?.text).toBe('ROLLBACK')
    expect(fake.released).toBe(1)
  })

  it('releases the connection when rollback itself fails', async () => {
    const fake = fakePool([{}, {}, {}, {}, { rows: [] }, { error: new Error('DDL failed') }, { error: new Error('rollback failed') }])

    await expect(applyAuthMigration(fake.pool, { databaseURL: directURL, target, sql })).rejects.toThrow('rollback')
    expect(fake.released).toBe(1)
    expect(fake.destroyed).toBe(true)
  })

  it('uses dry-run inspection without DDL or locking and reports status', async () => {
    const pending = fakePool([{ rows: [{ relation: null }] }])
    await expect(applyAuthMigration(pending.pool, { databaseURL: directURL, target, sql, dryRun: true })).resolves.toEqual({
      status: 'pending', version: '0001_auth',
    })
    expect(pending.transcript.map(({ text }) => text)).toEqual(['SELECT to_regclass($1) AS relation'])

    const applied = fakePool([{ rows: [{ relation: 'friendship_garden_migrations' }] }, { rows: [{ checksum: 'f86ee6037ced9d0acecb4baf12c920067fc2081bfdb3bc92e412681fc283407e' }] }])
    await expect(applyAuthMigration(applied.pool, { databaseURL: directURL, target, sql, dryRun: true })).resolves.toEqual({
      status: 'already-applied', version: '0001_auth',
    })
    expect(applied.transcript.map(({ text }) => text)).toEqual([
      'SELECT to_regclass($1) AS relation',
      'SELECT checksum FROM public.friendship_garden_migrations WHERE version = $1',
    ])
  })
})
