import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { Pool } from 'pg'
import { migrationVersions } from '../src/authMigration.ts'
import { createEmailReminderStore } from '../src/reminders/emailReminderStore.ts'
import { deliverEmailDigest } from '../src/reminders/deliverEmailDigest.ts'

// Use a fresh local cluster with a private socket and no TCP listener.
// Never load dotenv or fall back to normal PG environment variables.
const socket = process.argv[2]
if (!socket || resolve(socket) !== socket || !/^fg-reminder-db\.[A-Za-z0-9]+$/.test(basename(socket))) {
  throw new Error('Pass the absolute path of a fresh private fg-reminder-db.* socket directory.')
}
const directory = await stat(socket)
if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0) {
  throw new Error('The socket directory must be private and owned by the current user.')
}
const pool = new Pool({ host: socket, port: 5432, database: 'postgres', user: 'fg_reminder_fixture', ssl: false })
try {
  const { rows } = await pool.query(`SELECT current_user AS role, inet_server_addr() AS address,
    current_setting('unix_socket_directories') AS socket, current_setting('listen_addresses') AS listen,
    count(*) FILTER (WHERE schemaname = 'public')::int AS tables FROM pg_tables`)
  assert.deepEqual(rows[0], { role: 'fg_reminder_fixture', address: null, socket, listen: '', tables: 0 })
  for (const version of migrationVersions) {
    await pool.query(await readFile(new URL(`../migrations/${version}.sql`, import.meta.url), 'utf8'))
  }

  const store = createEmailReminderStore(pool)
  const email = 'synthetic@example.invalid'
  await pool.query(`INSERT INTO public."user" (id, name, email, "emailVerified") VALUES
    ('a', 'Synthetic A', $1, true), ('b', 'Synthetic B', 'other@example.invalid', false)`, [email])
  assert.equal(await store.read('a'), null)
  assert.equal(await store.enable('b', 'other@example.invalid', 'UTC'), false)
  assert.equal(await store.enable('a', 'wrong@example.invalid', 'UTC'), false)
  await assert.rejects(store.enable('a', email, '+01:00'))
  assert.equal(await store.enable('a', email, 'UTC'), true)
  const preference = await store.read('a')
  assert.ok(preference)
  await store.enable('a', email, 'UTC')
  assert.deepEqual(await store.read('a'), preference)

  const input = { accountId: 'a', email, emailVerified: true, now: new Date(), friends: [{ cadenceDays: 1 }] }
  const day = input.now.toISOString().slice(0, 10)
  assert.equal(await store.claim('b', day, preference), null)
  assert.equal(await store.claim('a', '2000-01-01', preference), null)
  const keys: string[] = []
  const uncertain = await Promise.allSettled(Array.from({ length: 8 }, () => deliverEmailDigest(input, store, async message => {
    keys.push(message.idempotencyKey)
    throw new Error('Synthetic timeout after submission')
  })))
  assert.equal(uncertain.filter(x => x.status === 'rejected').length, 1)
  assert.equal(keys.length, 1)
  assert.equal(await deliverEmailDigest(input, store, async () => { assert.fail('active lease') }), 'skipped')

  const initialLease = (await pool.query(`SELECT lease_token FROM public.email_reminder_deliveries`)).rows[0].lease_token
  await pool.query(`UPDATE public.email_reminder_deliveries SET lease_until = now() - interval '1 second'`)
  assert.equal(await deliverEmailDigest(input, store, async message => {
    keys.push(message.idempotencyKey)
    assert.equal(await store.markAccepted('a', day, initialLease), false)
  }), 'accepted')
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  assert.equal(await store.claim('a', day, preference), null)

  await pool.query(`UPDATE public.email_reminder_deliveries SET accepted_at = NULL, lease_until = now() - interval '2 hours', retry_until = now() - interval '1 hour'`)
  assert.equal(await store.claim('a', day, preference), null)
  await pool.query(`UPDATE public.email_reminder_deliveries SET retry_until = now() + interval '1 hour'`)
  await pool.query(`UPDATE public."user" SET email = 'changed@example.invalid' WHERE id = 'a'`)
  assert.equal(await store.claim('a', day, preference), null)
  assert.equal(await store.read('a'), null)
  await pool.query(`UPDATE public."user" SET email = $1 WHERE id = 'a'`, [email])
  await store.disable('a')
  assert.equal(await store.claim('a', day, preference), null)
  await store.enable('a', email, 'UTC')
  const revised = await store.read('a')
  assert.ok(revised)
  assert.notEqual(revised.revision, preference.revision)
  assert.equal(await store.claim('a', day, revised), null)
  await pool.query(`DELETE FROM public."user" WHERE id = 'a'`)
  assert.equal((await pool.query(`SELECT 1 FROM public.email_reminder_deliveries`)).rowCount, 0)
  assert.equal(await store.read('a'), null)
  console.log('Reminder PostgreSQL checks passed: consent, isolation, concurrent claims, bounded retries, opt-out, and cleanup.')
} finally {
  await pool.end()
}
