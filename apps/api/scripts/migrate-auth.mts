import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { applyAuthMigration, type DevelopmentMigrationTarget } from '../src/authMigration.ts'
import { authPoolConfig } from '../src/authDatabase.ts'

const manifestURL = new URL('../development-database.json', import.meta.url)
const migrationURL = new URL('../migrations/0001_auth.sql', import.meta.url)

const usage = `Usage: npm run db:migrate:dev -- --dry-run | --apply

Examples:
  npm run db:migrate:dev -- --dry-run
  npm run db:migrate:dev -- --apply

Options:
  --dry-run  Inspect the migration without making schema changes.
  --apply    Apply the development authentication migration.
  --help     Show this help.`

function migrationMode(arguments_: string[]) {
  if (arguments_.length === 1 && arguments_[0] === '--help') return 'help' as const
  if (arguments_.length === 1 && arguments_[0] === '--dry-run') return 'dry-run' as const
  if (arguments_.length === 1 && arguments_[0] === '--apply') return 'apply' as const
  throw new Error('Invalid arguments.')
}

function developmentTarget(value: unknown): DevelopmentMigrationTarget {
  if (!value || typeof value !== 'object') throw new Error('Invalid development target.')
  const target = value as Record<string, unknown>
  if (target.purpose !== 'development' || typeof target.host !== 'string' || !target.host ||
    typeof target.database !== 'string' || !target.database) {
    throw new Error('Invalid development target.')
  }
  return { purpose: 'development', host: target.host, database: target.database }
}

async function main() {
  const mode = migrationMode(process.argv.slice(2))
  if (mode === 'help') {
    console.log(usage)
    return
  }

  const databaseURL = process.env.DATABASE_URL
  if (!databaseURL) throw new Error('Missing database URL.')
  const [manifest, sql] = await Promise.all([
    readFile(manifestURL, 'utf8').then((text) => developmentTarget(JSON.parse(text) as unknown)),
    readFile(migrationURL, 'utf8'),
  ])
  const pool = new Pool(authPoolConfig(databaseURL))
  try {
    const result = await applyAuthMigration(pool, {
      databaseURL,
      target: manifest,
      sql,
      dryRun: mode === 'dry-run',
    })
    console.log(`Authentication migration ${result.version}: ${result.status}.`)
  } finally {
    await pool.end()
  }
}

void main().catch(() => {
  console.error('Authentication migration failed.')
  process.exitCode = 1
})
