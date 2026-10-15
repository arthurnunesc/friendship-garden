# Account Sync Foundation

Source: `plans/account-sync-notifications-roadmap.md`.

## Status — 2026-10-16

Native Phase 7 is committed in `89462d9` (fix/tests) and `e3f497b`
(roadmap/evidence). The isolated merge module below is implemented in
`apps/api/src/gardenSync.ts`, committed together with this status update.
Accounts and network sync are not enabled.

## Work order

1. **Merge contract** — complete. A tested, side-effect-free module under
   `apps/api` implements structured, entity-level last-write-wins sync.
2. **Authenticated storage** — pending. Add Better Auth, Netlify Functions,
   Neon schema/migrations, and account-scoped reads/writes. Test with an
   isolated database, never production credentials or data.
3. **Opt-in client sync** — pending. Explicitly confirm local-data import;
   keep local persistence and offline use working. Do not upload on sign-in.
4. **Recovery and verification** — pending. Test account switching/sign-out,
   retries, deletions, concurrent edits, backup compatibility, and reminders.

Backend reminder delivery remains a later scope. Do not introduce it here.

## First chunk: merge contract

Current web/mobile friends have creation and conversation dates, but no edit
versions or deletion markers. Uploading complete friend arrays would lose
independent conversation additions and could restore an old deleted record.
Do not change the existing local storage format to address this prematurely.

- Isolate the future backend in `apps/api`, with its own test/typecheck scripts.
  Do not move the existing garden domain or change web/mobile runtime imports.
- Use a version-1 snapshot containing separately versioned friend and
  interaction records. Every record has a nonblank ID, canonical UTC ISO
  `updatedAt`, a nonblank `changeId`, and an explicit deletion flag.
- Friend values contain name, optional birthday, positive integer cadence,
  and creation date. Interaction values contain date, optional type/note,
  and an immutable parent friend ID as part of their identity.
- A tombstone retains identity/version, not the old name, birthday, or note.
  Retain tombstones; do not invent a time-based pruning policy.
- Newer `updatedAt` wins. For equal timestamps, deletion wins over a live
  record; otherwise compare `changeId` by code-point order. Equal identity,
  timestamp, change ID, and deletion state with different values is invalid,
  not an arrival-order tie. Validate both complete input snapshots before
  selecting winners; do not ignore malformed data just because it is older.
- Merge is deterministic, idempotent, order-independent, and does not mutate
  its inputs. Reject malformed records/version collisions atomically. Build
  fresh, canonical records; do not retain unknown payload fields.
- Each input snapshot has at most one friend record per ID and one interaction
  record per `(friendId, id)` pair. Reject duplicate identities within a
  snapshot rather than guessing which duplicate the caller intended.
- Materialize only live friends and their live interactions. Hide orphaned
  children and children of deleted friends, but retain their versions in the
  sync snapshot. Derive `lastInteractionAt` from live interactions rather than
  syncing a second, potentially inconsistent copy.
- Sort output by stable identities; sort materialized conversations by date
  then ID. Expose the existing friend/interaction JSON shape to future clients.
- Older live records cannot overwrite newer tombstones. A genuinely newer
  live friend version can win under last-write-wins; offline edit/delete UX
  needs verification before client integration.

The merge module is **not** an authentication, account-isolation, or clock-trust
mechanism. A future handler must authenticate the account, load only its
records, validate timestamp policy, and commit merges transactionally. No HTTP
endpoint, credentials, database, client upload, or automatic local import is
part of this first chunk.

## First-chunk checks

- [x] Newer edits win independent of arrival order.
- [x] Independent conversation additions survive concurrent friend edits.
- [x] Friend/interaction tombstones reject stale versions.
- [x] Equal-time conflicts converge deterministically; reused versions fail.
- [x] Replays are idempotent; inputs and returned values do not alias.
- [x] Invalid dates, values, duplicate-version collisions, and unknown schema
  versions fail without a partial result.
- [x] Materialized friends have compatible backup shape and derived dates.
- [x] API tests/typecheck, existing web/mobile tests, and mobile typecheck pass.

### Verification — 2026-10-16

- API: `npm --prefix apps/api test` — **19 tests passed**.
- API: `npm --prefix apps/api run ts:check` — passed.
- API: `npm --prefix apps/api audit` — **0 vulnerabilities** reported.
- Web: `npm test` — **116 tests passed**.
- Mobile: `npm --prefix apps/mobile test` — **146 tests passed**.
- Mobile: `npm --prefix apps/mobile run ts:check` — passed.

The new package requires Node 22.12+ in the Node 22 line, or Node 24+.
Its isolated test runner uses Vitest 4.1.11 because the initially reused
3.2.4 dependency set had known audit findings. Existing web/mobile dependency
versions were not changed. No database, hosted service, or device was created
for this chunk; no native UI rerun was needed for this pure, unconnected module.

Coverage includes concurrent conversation additions, Unicode tie-breaking,
friend/interaction deletions, reused-version collisions, invalid snapshots,
canonicalization, output isolation, stable ordering, and materialized dates.
These are module tests, not proof of authenticated persistence or live sync.

## Questions before later chunks

- Passwordless email delivery provider and setup.
- Apple OAuth timing versus native distribution setup.
- Opt-in privacy copy for structured server-side relationship data.
- Local versus synced reminder preferences; avoid cross-device double alerts.
- Server timestamp/skew policy, transactional persistence, and account scope.
- Keep manual JSON backup support; decide how import interacts with remote
  records and deletion versions before enabling signed-in import.

These questions do not block the isolated merge module. They do block claiming
that account-backed sync is complete or deploying it without further setup.

Better Auth's current docs confirm that passwordless magic links require an
actual `sendMagicLink` implementation. Do not simulate delivery by logging
tokens or URLs. Apple Sign In also requires an HTTPS return URL rather than
localhost. Resolve the email provider and Apple timing before those paths are
enabled. These are not reasons to use the user's physical iPhone.

Reference checked: Better Auth v1.6.23 documentation for
[magic links](https://www.better-auth.com/docs/plugins/magic-link) and
[Apple](https://www.better-auth.com/docs/authentication/apple).
