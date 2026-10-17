import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import type { createAuth } from '../src/auth/auth.ts'
import { createGardenStore } from '../src/gardenStore.ts'
import { createGardenHandler } from '../src/gardenHandler.ts'
import { mergeGardenSnapshots, type SyncSnapshot } from '../src/gardenSync.ts'

export async function checkGardenPostgres(
  pool: Pool,
  auth: ReturnType<typeof createAuth>,
  baseURL: string,
  firstUserId: string,
  firstCookie: string,
  capturedEmails: { email: string, url: string }[],
): Promise<void> {
  const empty = (): SyncSnapshot => ({ version: 1, friends: [], interactions: [] })
  const friend = (id: string, name = id): SyncSnapshot => ({ ...empty(), friends: [{
    id, deleted: false, updatedAt: '2026-10-01T00:00:00.000Z', changeId: 'first-change',
    value: { name, cadenceDays: 7, createdAt: '2026-01-01T00:00:00.000Z' },
  }] })
  const store = createGardenStore(pool)
  // A real session lookup against the disposable Better Auth PostgreSQL database.
  const runtime = {
    baseURL, gardens: store,
    getUserId: async (headers: Headers) => (await auth.api.getSession({
      headers, query: { disableCookieCache: true, disableRefresh: true },
    }))?.user.id ?? null,
  }
  const garden = createGardenHandler(() => runtime)
  const request = (cookie: string, method = 'GET', incoming?: unknown, path = '/api/garden') => garden(
    new Request(baseURL + path, {
      method, headers: { cookie, origin: baseURL, 'content-type': 'application/json' },
      ...(incoming !== undefined ? { body: JSON.stringify(incoming) } : {}),
    }), '192.0.2.1',
  )
  assert.equal((await request('')).status, 401)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM public.gardens')).rows[0].count, 0)
  assert.deepEqual(await (await request(firstCookie)).json(), empty())
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM public.gardens')).rows[0].count, 0)

  const secondEmail = 'synthetic-second@example.invalid'
  const signIn = await auth.handler(new Request(baseURL + '/api/auth/sign-in/magic-link', {
    method: 'POST', headers: { origin: baseURL, 'content-type': 'application/json', 'x-auth-client-ip': '192.0.2.2' },
    body: JSON.stringify({ email: secondEmail, callbackURL: '/' }),
  }))
  assert.equal(signIn.status, 200)
  const link = [...capturedEmails].reverse().find((email) => email.email === secondEmail)?.url
  assert(link)
  const verification = await auth.handler(new Request(link))
  assert.equal(verification.status, 302)
  const secondCookie = verification.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
  const secondSession = await auth.api.getSession({ headers: new Headers({ cookie: secondCookie }) })
  assert(secondSession)
  const secondUserId = secondSession.user.id
  assert.notEqual(firstUserId, secondUserId)
  const parallel = await Promise.all([
    request(firstCookie, 'POST', friend('one')),
    request(firstCookie, 'POST', friend('two')),
  ])
  assert(parallel.every((response) => response.status === 200))
  let current = mergeGardenSnapshots(friend('one'), friend('two'))
  assert.deepEqual(await store.read(firstUserId), current, 'Concurrent initial writers must not lose records.')
  assert.equal((await request(secondCookie, 'POST', friend('one', 'different account'))).status, 200)
  assert.deepEqual(await (await request(secondCookie)).json(), friend('one', 'different account'))
  assert.deepEqual(await (await request(firstCookie)).json(), current)
  assert.equal((await request(firstCookie, 'GET', undefined, `/api/garden?userId=${secondUserId}`)).status, 400)
  assert.equal((await request(firstCookie, 'POST', { ...empty(), userId: secondUserId })).status, 400)
  const conflict = await request(firstCookie, 'POST', friend('one', 'same version different value'))
  assert.equal(conflict.status, 409)
  assert.deepEqual(await store.read(firstUserId), current)

  const interaction: SyncSnapshot = { ...empty(), interactions: [{
    friendId: 'one', id: 'interaction', deleted: false, changeId: 'interaction-add',
    updatedAt: '2026-10-02T00:00:00.000Z', value: { date: '2026-10-02T00:00:00.000Z', note: 'synthetic' },
  }] }
  const deletion: SyncSnapshot = { ...empty(), friends: [{
    id: 'one', deleted: true, updatedAt: '2026-10-03T00:00:00.000Z', changeId: 'delete-one',
  }] }
  await Promise.all([store.merge(firstUserId, interaction), store.merge(firstUserId, deletion)])
  current = mergeGardenSnapshots(mergeGardenSnapshots(current, interaction), deletion)
  assert.deepEqual(await store.read(firstUserId), current)
  assert.deepEqual(await store.merge(firstUserId, friend('one')), current, 'Stale clients cannot resurrect tombstones.')
  assert.deepEqual(await store.merge(firstUserId, empty()), current, 'Omissions cannot delete records.')

  await pool.query(`CREATE FUNCTION public.reject_garden_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic garden write failure'; END $$;
    CREATE TRIGGER reject_garden_update BEFORE UPDATE ON public.gardens
      FOR EACH ROW EXECUTE FUNCTION public.reject_garden_update()`)
  try {
    await assert.rejects(store.merge(firstUserId, friend('will-rollback')))
    assert.deepEqual(await store.read(firstUserId), current, 'Failed writes must roll back atomically.')
  } finally {
    await pool.query('DROP TRIGGER reject_garden_update ON public.gardens; DROP FUNCTION public.reject_garden_update()')
  }
  await assert.rejects(store.merge('nonexistent-user', empty()), { code: '23503' })
  await assert.rejects(pool.query('UPDATE public.gardens SET snapshot = $2::jsonb WHERE user_id = $1', [
    firstUserId, JSON.stringify({ version: 99, friends: [], interactions: [] }),
  ]), { code: '23514' })
  assert.deepEqual(await store.read(firstUserId), current)

  assert.equal((await auth.handler(new Request(baseURL + '/api/auth/sign-out', {
    method: 'POST', headers: { cookie: secondCookie, origin: baseURL },
  }))).status, 200)
  assert.equal((await request(secondCookie)).status, 401)
  assert.equal((await request(secondCookie, 'POST', friend('revoked-session'))).status, 401)
  await pool.query('DELETE FROM public."user" WHERE id = $1', [secondUserId])
  assert.deepEqual(await store.read(secondUserId), empty(), 'Account deletion cascades to its garden.')
  assert.deepEqual(await (await request(firstCookie)).json(), current, 'Another user is unaffected by deletion/sign-out.')
  console.log('PostgreSQL gardens passed: real cookie sessions, account isolation, first-write races, concurrent edits, tombstones, replay, rollback, constraints, revocation, and account deletion.')
}
