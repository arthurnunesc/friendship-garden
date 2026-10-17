import { createHash } from 'node:crypto'

export const AUTH_MIGRATION_VERSION = '0001_auth'
export type MigrationVersion = typeof AUTH_MIGRATION_VERSION | '0002_gardens'
const migrationVersions: readonly MigrationVersion[] = [AUTH_MIGRATION_VERSION, '0002_gardens']

const advisoryLockKey = 713_941_518
const migrationsTable = 'public.friendship_garden_migrations'

export interface DevelopmentMigrationTarget {
  purpose: 'development'
  host: string
  database: string
}

export interface QueryResult<Row> {
  rows: Row[]
}

export interface Client {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>
  release(destroy?: boolean): void
}

export interface Pool {
  connect(): Promise<Client>
}

export interface AuthMigrationOptions {
  databaseURL: string
  target: DevelopmentMigrationTarget
  sql: string
  version?: MigrationVersion
  dryRun?: boolean
}

export interface AuthMigrationResult {
  status: 'applied' | 'already-applied' | 'pending'
  version: MigrationVersion
}

type ExistingMigration = { checksum: string }
type Relation = { relation: string | null }

function migrationChecksum(sql: string) {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

function poolerHost(host: string) {
  const firstDot = host.indexOf('.')
  if (firstDot === -1) return `${host}-pooler`
  return `${host.slice(0, firstDot)}-pooler${host.slice(firstDot)}`
}

function validateTarget(databaseURL: string, target: DevelopmentMigrationTarget) {
  if (target.purpose !== 'development') {
    throw new Error('Authentication migrations require a development target.')
  }

  let url: URL
  let database: string
  try {
    url = new URL(databaseURL)
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    throw new Error('Invalid authentication migration database configuration.')
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !database || (url.port && url.port !== '5432')) {
    throw new Error('Invalid authentication migration database configuration.')
  }

  for (const [name, value] of url.searchParams) {
    if (['schema', 'search_path'].includes(name.toLowerCase()) ||
      (name.toLowerCase() === 'options' && /search[_-]?path/i.test(value))) {
      throw new Error('Authentication migration database configuration cannot set a schema or search path.')
    }
  }

  if (database !== target.database || !target.host || (url.hostname !== target.host && url.hostname !== poolerHost(target.host))) {
    throw new Error('Authentication migration database does not match the development target.')
  }
}

function assertChecksum(existing: ExistingMigration | undefined, checksum: string, version: MigrationVersion) {
  if (existing && existing.checksum !== checksum) {
    throw new Error(`Authentication migration ${version} checksum does not match.`)
  }
}

async function inspectMigration(client: Client, checksum: string, version: MigrationVersion): Promise<AuthMigrationResult> {
  const relation = await client.query<Relation>('SELECT to_regclass($1) AS relation', [migrationsTable])
  if (!relation.rows[0]?.relation) {
    return { status: 'pending', version }
  }

  const existing = await client.query<ExistingMigration>(
    `SELECT checksum FROM ${migrationsTable} WHERE version = $1`,
    [version],
  )
  assertChecksum(existing.rows[0], checksum, version)
  return {
    status: existing.rows[0] ? 'already-applied' : 'pending',
    version,
  }
}

export async function applyAuthMigration(pool: Pool, options: AuthMigrationOptions): Promise<AuthMigrationResult> {
  const version: unknown = options.version ?? AUTH_MIGRATION_VERSION
  if (!migrationVersions.includes(version as MigrationVersion)) {
    throw new Error('Unknown authentication migration version.')
  }
  const migrationVersion = version as MigrationVersion
  validateTarget(options.databaseURL, options.target)
  const checksum = migrationChecksum(options.sql)
  const client = await pool.connect()

  if (options.dryRun) {
    try {
      return await inspectMigration(client, checksum, migrationVersion)
    } finally {
      client.release()
    }
  }

  let transactionStarted = false
  let discardConnection = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey])
    await client.query('SET LOCAL search_path TO public')
    await client.query(`CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)

    const existing = await client.query<ExistingMigration>(
      `SELECT checksum FROM ${migrationsTable} WHERE version = $1`,
      [migrationVersion],
    )
    assertChecksum(existing.rows[0], checksum, migrationVersion)
    if (existing.rows[0]) {
      await client.query('COMMIT')
      transactionStarted = false
      return { status: 'already-applied', version: migrationVersion }
    }

    await client.query(options.sql)
    await client.query(
      `INSERT INTO ${migrationsTable} (version, checksum) VALUES ($1, $2)`,
      [migrationVersion, checksum],
    )
    await client.query('COMMIT')
    transactionStarted = false
    return { status: 'applied', version: migrationVersion }
  } catch (error) {
    if (!transactionStarted) throw error

    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      discardConnection = true
      throw new AggregateError([error, rollbackError], 'Authentication migration failed and rollback could not complete.')
    }
    throw error
  } finally {
    client.release(discardConnection)
  }
}
