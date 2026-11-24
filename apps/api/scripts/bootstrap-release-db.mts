import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Pool } from 'pg'
import { authPoolConfig } from '../src/authDatabase.ts'
import { migrationVersions } from '../src/authMigration.ts'

const usage = `Usage: npm --prefix apps/api run db:bootstrap:release -- --dry-run|--apply HOST DATABASE

Owner-run initial setup for a separate, empty Neon database. HOST must be the
direct compute hostname checked in the Neon dashboard, with no URL or password.
Reads the direct owner connection string on stdin; --apply also reads the
runtime role password (64 lowercase hex digits) on the second line. No .env
files are loaded. Never put either secret in the arguments.

Examples:
  npm --prefix apps/api run db:bootstrap:release -- --dry-run <direct-host> neondb
  npm --prefix apps/api run db:bootstrap:release -- --apply <direct-host> neondb

Use the hidden-input command in plans/web-account-sync-release.md.`

const tableNames = ['user', 'session', 'account', 'verification', 'rateLimit', 'gardens',
  'email_reminder_preferences', 'email_reminder_deliveries', 'email_reminder_suppressions']
const ledger = 'friendship_garden_migrations'
const runtimeRole = 'friendship_garden_app'
const appTablesSQL = tableNames.map(name => `public."${name}"`).join(', ')
let stage = 'input validation'

async function main() {
  const [mode, host, database, ...extra] = process.argv.slice(2)
  if (mode === '--help' && !host) { console.log(usage); return }
  if (!['--dry-run', '--apply'].includes(mode ?? '') || !host || !database || extra.length || process.stdin.isTTY) {
    throw new Error('See --help. Use the documented hidden-input command.')
  }
  // Use an independently checked direct endpoint. Reject the repo's pinned development host.
  const dev = JSON.parse(await readFile(new URL('../development-database.json', import.meta.url), 'utf8')) as { host: string }
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.aws\.neon\.tech$/.test(host) || host.split('.')[0]?.endsWith('-pooler') || host === dev.host) {
    throw new Error('Expected a direct Neon compute hostname other than the retained development host.')
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) throw new Error('Invalid database name.')

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const lines: string[] = []
  try {
    for await (const line of input) {
      if (lines.length >= 2 || line.length > 4096) throw new Error('Invalid stdin format.')
      lines.push(line)
    }
  } finally { input.close() }
  const [ownerURL, runtimePassword] = lines
  if (lines.length !== (mode === '--apply' ? 2 : 1) || !ownerURL ||
    (mode === '--apply' && !/^[0-9a-f]{64}$/.test(runtimePassword ?? ''))) throw new Error('Invalid stdin format.')

  const url = new URL(ownerURL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host || url.pathname !== `/${database}` ||
    (url.port && url.port !== '5432') || !url.username || !url.password || url.hash || url.username === runtimeRole ||
    [...url.searchParams].some(([name, value]) => !((name === 'sslmode' && ['require', 'verify-full'].includes(value)) ||
      (name === 'channel_binding' && value === 'require')))) throw new Error('Owner connection string does not match the direct target.')

  const migrations = await Promise.all(migrationVersions.map(async version => {
    const sql = await readFile(new URL(`../migrations/${version}.sql`, import.meta.url), 'utf8')
    return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') }
  }))
  const pool = new Pool({ ...authPoolConfig(ownerURL), connectionTimeoutMillis: 15_000, query_timeout: 30_000 })
  try {
    stage = 'database connection'
    const client = await pool.connect()
    try {
      await client.query(mode === '--dry-run' ? 'BEGIN READ ONLY' : 'BEGIN')
      await client.query("SET LOCAL search_path TO public; SET LOCAL lock_timeout TO '10s'; SET LOCAL statement_timeout TO '20s'")
      await client.query('SELECT pg_advisory_xact_lock(713941518)')
      stage = 'database identity and initial state'
      const identity = await client.query<{ matches: boolean; owned: boolean }>(`SELECT current_database() = $1 AS matches,
        pg_get_userbyid(datdba) = current_user AS owned FROM pg_database WHERE datname = current_database()`, [database])
      if (!identity.rows[0]?.matches || !identity.rows[0].owned) throw new Error('Connect as the owner of the pinned database.')
      const relations = (await client.query<{ relname: string }>(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`)).rows.map(row => row.relname)
      const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])
      const initialized = relations.includes(ledger)
      if (initialized) {
        const expected = [...tableNames, ledger].sort()
        if (relations.length !== expected.length || expected.some(name => !relations.includes(name)) || role.rowCount !== 1) {
          throw new Error('Existing database differs from the bootstrap schema. Stop for review.')
        }
        stage = 'migration checksum verification'
        const old = (await client.query<{ version: string; checksum: string }>(`SELECT version, checksum FROM public.${ledger}`)).rows
        if (old.length !== migrations.length || migrations.some(m => !old.some(row => row.version === m.version && row.checksum === m.checksum))) {
          throw new Error('Migration ledger differs from this release. Stop for review.')
        }
      } else if (relations.length || role.rowCount) {
        throw new Error('Initial bootstrap requires an empty database and an unused runtime role.')
      }

      if (!initialized && mode === '--apply') {
        stage = 'transactional migration and runtime grants'
        await client.query(`CREATE TABLE public.${ledger} (version text PRIMARY KEY, checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now())`)
        for (const migration of migrations) {
          await client.query(migration.sql)
          await client.query(`INSERT INTO public.${ledger} (version, checksum) VALUES ($1, $2)`, [migration.version, migration.checksum])
        }
        // Neon requires a plaintext password for SQL role creation; do not log this statement.
        // The input is restricted to 64 lowercase hex digits before constructing it.
        await client.query(`CREATE ROLE ${runtimeRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${runtimePassword}'`)
        await client.query(`GRANT CONNECT ON DATABASE "${database}" TO ${runtimeRole};
          GRANT USAGE ON SCHEMA public TO ${runtimeRole};
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${appTablesSQL} TO ${runtimeRole}`)
      }
      if (initialized || mode === '--apply') {
        stage = 'runtime grant verification'
        const checks = await client.query<{ safe: boolean }>(`SELECT rolcanlogin AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
          AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
          AND has_database_privilege(rolname, current_database(), 'CONNECT')
          AND has_schema_privilege(rolname, 'public', 'USAGE')
          AND NOT has_schema_privilege(rolname, 'public', 'CREATE')
          AND NOT has_table_privilege(rolname, $2, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) AS t(name)
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p(priv)
            WHERE NOT has_table_privilege(rolname, t.name, p.priv)) AS safe
          FROM pg_roles r WHERE rolname=$1`, [runtimeRole, `public.${ledger}`, tableNames.map(name => `public."${name}"`)])
        if (!checks.rows[0]?.safe) throw new Error('Runtime grants do not match the limited app role.')
      }
      stage = 'transaction completion'
      await client.query('COMMIT')
      const status = initialized ? 'already applied (checksums matched)' : mode === '--dry-run' ? 'pending (read-only)' : 'applied'
      for (const migration of migrations) console.log(`${migration.version}: ${status}`)
      if (initialized || mode === '--apply') console.log(`Limited runtime grants verified for ${runtimeRole}.`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
  } finally { await pool.end() }

  if (mode === '--apply') {
    stage = 'runtime login after commit (schema is already initialized)'
    url.username = runtimeRole
    url.password = runtimePassword!
    const runtime = new Pool({ ...authPoolConfig(url.href), connectionTimeoutMillis: 15_000, query_timeout: 15_000 })
    try { await runtime.query('SELECT id FROM public."user" LIMIT 0') } finally { await runtime.end() }
    console.log(`Runtime login verified for ${runtimeRole}.`)
  }
}

void main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  console.error(`Release database bootstrap stopped at ${stage}${/^[0-9A-Z]{5}$/.test(code) ? ` (SQLSTATE ${code})` : ''}. No credentials or database error text are printed. See --help.`)
  process.exitCode = 1
})
