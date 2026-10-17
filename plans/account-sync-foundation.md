# Account Sync Foundation

Source: `plans/account-sync-notifications-roadmap.md`.

## Status — 2026-10-16

Native Phase 7 is committed in `89462d9` (fix/tests) and `e3f497b`
(roadmap/evidence). The isolated merge module below is implemented in
`apps/api/src/gardenSync.ts`, committed together with this status update.
Client account controls and garden network sync are not enabled.

## Work order

1. **Merge contract** — complete. A tested, side-effect-free module under
   `apps/api` implements structured, entity-level last-write-wins sync.
2. **Authenticated storage** — in progress. Authentication bootstrap is
   implemented, and PostgreSQL migrations are verified and applied to a separate
   development project. Account-scoped garden reads/writes are still pending.
   Test with an isolated database, never production credentials or data.
3. **Opt-in client sync** — pending. Explicitly confirm local-data import;
   keep local persistence and offline use working. Do not upload on sign-in.
4. **Recovery and verification** — pending. Test account switching/sign-out,
   retries, deletions, concurrent edits, backup compatibility, and reminders.

Backend reminder delivery remains a later scope. Do not introduce it here.

### Verification workflow — 2026-10-17

The user wants implementation to proceed without user-run tests now. Batch
hands-on verification into the final integration pass, then fix any failures.
Pending Google consent or personal-inbox checks do not block independent
storage, client authentication, or sync implementation.

- Keep agent-run automated checks with each implementation chunk: account
  isolation, transactions, conflict/deletion handling, offline state, and
  existing web/mobile regressions. Keep isolated test-resource cleanup.
- Keep small verified commits and roadmap updates. Distinguish **implemented**,
  **automatically checked**, and **manually verified**; do not mark deferred
  checks as passed or claim production readiness.
- The user plans to test their own Android phone and iPhone thoroughly once
  the integrated flow is ready. This does not authorize agent use of either
  physical phone now. No paid device-testing runs are requested.

Final user-run verification checklist (all **pending**, not requested now):

- [ ] Google consent/callback and email-link delivery to a personal inbox.
- [ ] Explicit local-garden import consent; cancellation uploads nothing.
- [ ] Same account on web, Android, and iPhone sees the expected garden.
- [ ] Offline edits reconnect safely; concurrent edits/deletions converge.
- [ ] Restart, retry, sign-out, and account switching do not expose another
  account's data or lose the user's local garden.
- [ ] Manual backups and import/export still work on both phones.
- [ ] Reminder permissions, scheduling, edits/deletions, and delivery work
  on both phones, including relevant background/battery restrictions.

Fix reported failures and rerun the affected checks before closing that pass.
Apple sign-in and backend reminder email remain deferred; neither belongs
to the acceptance checklist for this implementation scope.

### Authentication bootstrap — implemented 2026-10-16

The user selected **Resend** for passwordless sign-in and **deferred Apple
OAuth**. Implement Google and email first; reminder email remains out of scope.
This chunk adds the authentication factory, Resend sender, fail-closed Netlify
handler, and setup examples, committed together with this status update. It
does not add garden storage or client UI. Missing configuration returns a
generic uncached 503; no provider or database is contacted in that case.

Use HTTPS and an explicit origin, hashed single-use magic-link tokens with a
five-minute expiry, database-backed rate limits, and no automatic account
linking. Never log tokens, URLs, email bodies, or configuration secrets. The
Netlify handler must overwrite the auth IP header from trusted `context.ip`,
not trust client-supplied forwarding headers. No migrations run on requests.

The initial tests below use disposable in-memory SQLite through Better Auth's
supported Node adapter and captured email. Separate real PostgreSQL checks now
also pass, as recorded in the development setup section. Do not treat SQLite
tests as PostgreSQL or live-provider evidence.

### Authentication verification — 2026-10-16

- `npm --prefix apps/api test` — **63 tests passed**, including the original
  19 merge tests. Auth tests use Better Auth 1.6.23 with a fresh in-memory
  SQLite database per case, closed after each test, and captured email only.
- API typecheck passes, including the Netlify `.mts` entrypoint. API
  `npm audit` reports **0 vulnerabilities**.
- Verified single-use/expired links, hashed storage, secure session cookies,
  authenticated session reads, sign-out revocation, database-backed request
  limits, Google authorization URL generation, and disabled Apple/passwords.
- Verified untrusted origin and all three callback fields are rejected before
  email delivery. Provider/database exceptions and 5xx bodies are replaced by
  generic errors; forwarding headers cannot override Netlify's client IP.
- Mocked Resend SDK tests cover plaintext copy, hashed idempotency keys, URL
  checks, and redacted failures. No email was sent.
- Local `netlify functions:build` created an auth archive. Its packaged user
  module imports and returns the expected fail-closed 503 with an empty
  secret. This is not a deployed Lambda invocation. Direct import of the
  generated platform wrapper required Lambda's `awslambda` global; that
  unsupported local check is not counted as a pass.
- Owned temporary archive/extraction directories were deleted after success
  and failure. No database server, container, device, or hosted service was
  started. SQLite databases existed only in memory.
- The web production build and **116 web tests** pass. **146 mobile tests**
  and mobile typecheck pass. Neither client imports the authentication code.

The package now requires Node **22.13+ in the Node 22 line, or Node 24+**
because its tests use unflagged `node:sqlite`. PostgreSQL configuration always
verifies TLS certificates and does not allow connection-URL SSL options to
disable that check. API keys and database credentials are server-only; the
example secret is blank so a copied example cannot enable authentication.
Local environment files and Netlify artifacts are ignored by Git.

### Next gates

1. Complete a real Google account consent and callback exchange. Authorization
   initiation and the preview redirect pass; an interactive Google login has
   not been performed. Keep secrets out of chat and Git.
2. Hosted passwordless sessions and real Resend delivery to the provider test
   inbox now pass, as recorded below. Personal inbox delivery remains unverified.
   No schema migration runs on an incoming request.
3. Add authenticated, account-scoped garden storage and transactional merges.
   Authentication scaffolding alone is not account isolation or live sync.
4. Only then wire opt-in web/mobile clients and explicit local-import consent.

No production deployment or production database migration has been run. Manual JSON backups,
local storage, offline use, and native reminder behavior stay unchanged.

### Hosting and sender discovery — 2026-10-16

Read-only inspection through the existing authenticated Netlify and Resend
CLIs found:

- Netlify project `friendship-garden`, connected to
  `github.com/arthurnunesc/friendship-garden`.
- Existing **production** URL: `https://friendship-garden.arthurnun.es`.
  Its Netlify hostname is `friendship-garden.netlify.app`.
- Production branch is `main`; branch deployment settings currently allow
  only `main`. The deployment list contains a ready production deployment,
  not an isolated development preview. The `main--` alias also targets that
  production deployment and must not be treated as a test environment.
- The custom domain has an associated Netlify DNS zone.
- Resend has one verified sending domain:
  `read-later-digest.arthurnun.es` (EU West). It belongs to another app and
  should not be reused as this app's sender without an explicit decision.
- Resend reports **1 of 3 domain slots used**. A new app-specific domain fits
  the current domain quota; no plan upgrade was requested or performed.

The configuration proposed at this discovery checkpoint was:

- Use a Netlify branch deployment for `feature/mobile-app-creation`, with
  branch-specific authentication settings and a separate development database.
  Obtain and verify its actual HTTPS URL from Netlify after provisioning.
- Verify the sending domain `auth.friendship-garden.arthurnun.es` and use
  `Friendship Garden <sign-in@auth.friendship-garden.arthurnun.es>`.
- Keep sign-in link tracking disabled and use an app-scoped sending key in
  the server environment, not the broad CLI credential or a public variable.

No DNS, provider, deployment, key, or Git remote change was made during that
discovery. The user then explicitly approved the branch push, preview, and
sender domain/DNS changes below. Existing CLI logins handled these steps;
the user did not need to invent names or paste secrets into chat.

### Approved preview and sender provisioning — 2026-10-16

- Pushed `feature/mobile-app-creation` through discovery commit `de339e1`.
  Netlify's allowed branches now include only the previous `main` plus this
  feature branch. Production still uses `main`.
- **Preview:** <https://feature-mobile-app-creation--friendship-garden.netlify.app>.
  Initial branch deploy `6ad1dcd1dd12ebe8bed9e576` is **ready**, context
  `branch-deploy`, source `de339e1`. The runtime source is auth commit
  `d60d231`; later documentation pushes can replace the branch preview.
- Browser verification: the garden loads with its local-only empty state and
  add/export/import controls. `GET /api/auth/get-session` returns the expected
  generic **503** JSON with `Cache-Control: no-store`. Live sign-in is still
  disabled until configuration, database migrations, and provider checks pass.
  A first browser wait used the wrong heading capitalization and timed out;
  the fresh snapshot and explicit response assertions passed. Both owned
  browser sessions were closed; no persistent browser test data is required.
- **Sender domain:** `auth.friendship-garden.arthurnun.es`, Resend ID
  `067a9e69-d114-45f0-b20c-42672b2de241`, region `eu-west-1`, **verified**.
  Sending is enabled; receiving, open tracking, and click tracking are disabled.
  The enforced-TLS update was accepted, but the GET response omits that setting,
  so it is not independently read-back verified.
- **Sender address:** `Friendship Garden <sign-in@auth.friendship-garden.arthurnun.es>`.
  Domain verification permits this address; no email was sent and no inbox or
  actual delivery was tested.
- All four required DNS records resolve on an authoritative nameserver and
  have Resend status **verified**. The parent already has DMARC `p=none`; no
  DMARC policy was changed. Enforce a stronger policy only after delivery checks.
- The site's stored DNS zone ID was stale and returned 404. Account DNS lookup
  found the active `arthurnun.es` zone **`6a1decc110ba17c7557ddaac`**; public
  NS records match `dns1`–`dns4.p05.nsone.net`. No stale zone was recreated.
- Production deploy **`6a1df450234f820008eea876`**, commit
  `1e3b28c21fb2d4fa3ef2a0e33f49da70fd5a1112`, remained published after setup.
  All pre-existing DNS record IDs remain present. The existing read-later
  Resend domain is still verified and was not modified.

New DNS records in the active zone (TTL 300):

| Record ID | Type | Hostname relative to `arthurnun.es` | Purpose |
| --- | --- | --- | --- |
| `6ad1dcfd8aac4db75ca53302` | TXT | `resend._domainkey.auth.friendship-garden` | Provider DKIM public key |
| `6ad1dcff588522b86b8c5afc` | MX | `send.auth.friendship-garden` | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 |
| `6ad1dd01495951a9cf05a799` | TXT | `send.auth.friendship-garden` | `v=spf1 include:amazonses.com ~all` |
| `6ad1dd0247c5a766b3247ad1` | CNAME | `rsend.auth.friendship-garden` | `send.forge.rmta.net` |

These are **approved retained development resources**, owned by this project,
not disposable test resources. No plan upgrade, database, sending key, or
production environment variable was created or changed. Removal, if later
approved: remove only this feature branch from the site's allowed branches
(preserve all other entries); delete only the four record IDs above with
`netlify api deleteDnsRecord --data '{"zone_id":"6a1decc110ba17c7557ddaac","dns_record_id":"<record-id>"}'`;
delete only the new Resend domain with
`resend domains delete 067a9e69-d114-45f0-b20c-42672b2de241`.
Do not run those removal commands during normal setup or alter the other app's
sender. Stop future branch deployments before removing their supporting setup.

### User credential checks — 2026-10-16

After the user completed Google setup and Neon login:

- Google client ID and secret are present in the ignored local handoff file.
  Values were not printed, committed, or passed into the unit-test environment.
- A fresh browser reached Google's sign-in page using that client ID and
  `https://feature-mobile-app-creation--friendship-garden.netlify.app/api/auth/callback/google`.
  There was no invalid-client or redirect-mismatch screen. No Google account
  login was performed; the client-secret exchange, consent/test-user access,
  and completed session remain **unverified**.
- Neon CLI authentication works. Project discovery requires an explicit
  organization selection; the earlier unqualified lookup failure was not
  evidence of a failed login. No dedicated Friendship Garden development
  project was found. Unrelated projects were not modified or used for tests.
- Local `DATABASE_URL` and `RESEND_API_KEY` are still example placeholders;
  `BETTER_AUTH_SECRET` is unset. No connection was made using those placeholders.
  These are remaining setup tasks, not a failure of the Google credential entry.
- The preview still returns the expected uncached **503** for session reads.
  Google variables have not yet been uploaded to Netlify by this check.
- API tests were rerun without loading the local credentials: **63 passed**,
  and API typecheck passed. The owned browser session was closed in `finally`.

Full sign-in verification is blocked until the dedicated development database,
app-restricted Resend sending key, random authentication secret, branch-only
server configuration, and PostgreSQL migrations are ready. No cloud resource
or provider configuration was changed during these checks.

### Development database and secret setup — 2026-10-16

The user approved creating the missing development resources, with no plan
upgrade. This section supersedes the missing-configuration checkpoint above.

- Created **`friendship-garden-development`**, Neon project
  **`mute-wave-82809907`**, PostgreSQL 17 in `aws-eu-central-1`, fixed 0.25 CU.
  Its retained branch is `br-morning-pine-ba055d1b`, endpoint
  `ep-silent-leaf-batw3dyz`, database `neondb`. No unrelated project was changed.
- `apps/api/development-database.json` pins the non-secret migration target.
  Reviewed SQL `migrations/0001_auth.sql` matches Better Auth 1.6.23's PostgreSQL
  schema: five auth tables and three indexes, plus the migration runner's ledger.
- Added `npm --prefix apps/api run db:migrate:dev -- --dry-run` and `--apply`.
  The runner rejects other hosts/databases, non-development targets, nonstandard
  ports, and schema/search-path overrides before connecting. It uses verified
  TLS, a transaction advisory lock, a fixed search path, and a checksum ledger.
  A failed rollback discards the connection rather than returning it to the pool.
- The retained development database reported **pending → applied → already-applied**.
  No request handler runs migrations and no production database was migrated.
- Added `npm --prefix apps/api run test:postgres`: owns a fresh schema-only
  Neon test branch, verifies its identity/endpoint, uses synthetic credentials
  and captured email, then deletes and confirms removal of that exact branch.
  Cleanup is registered before creation, includes interruption handling, and
  branch expiry is a one-hour fallback. It never loads `.env.local`.
- Real PostgreSQL checks pass: concurrent/idempotent migration, checksum mismatch
  rejection, no Better Auth schema drift, hashed/single-use/expired magic links,
  secure sessions, sign-out, and database-backed request limits.
- Temporary branches `br-misty-lake-baz4pav6`, `br-red-butterfly-bawkfcng`,
  `br-divine-voice-bayal04i`, and `br-crimson-wind-bak6i7cm` were all deleted.
  The first two stopped at an overstrict test ancestry assertion: Neon schema-only
  branches are independent roots, not child forks. The corrected checks pass.
- Created Resend key **`c16c1cce-f81e-40f0-8bfd-777c635c7618`**, `sending_access`
  restricted to domain `067a9e69-d114-45f0-b20c-42672b2de241`. Its value and a
  fresh random auth secret are stored only in ignored local/server configuration.
  User-entered Google credential lines were preserved.
- Configured all seven auth variables only for Netlify branch
  `feature/mobile-app-creation`. The four private values are marked secret.
  Netlify **Free** does not support Functions-only scopes. The user explicitly
  chose to stay on Free and allow branch build access; secret scopes are
  `builds`, `functions`, and `runtime`, not post-processing. This replaces the
  earlier Functions-only setup intention. No public-prefixed variable was added.
- Verified the production environment fingerprint is unchanged. The local CLI
  is linked to the existing site in ignored `.netlify` state. No plan was upgraded.
- Current checks: **75 API tests**, API typecheck, **0 API audit findings**,
  **116 web tests** and web build, **146 mobile tests** and mobile typecheck pass.
  Hosted sign-in verification is the next step; these checks alone do not claim
  completed Google consent, actual inbox delivery, or client garden sync.

Approved retained resources belong to this project's development environment,
not to the test lifecycle. If later removal is approved, first remove their
branch-only Netlify values, then revoke only the new key with
`resend api-keys delete c16c1cce-f81e-40f0-8bfd-777c635c7618` and remove only the
new project with `neon projects delete mute-wave-82809907`. Do not run these
commands as routine test cleanup. Keep the user-owned local credentials private.

### Hosted authentication verification — 2026-10-16

Runtime and migration source is committed as **`1be237f`**. The configured
development preview now serves authentication rather than the earlier
missing-configuration 503. There is still no client sign-in UI or garden sync.

- Created owned schema-only test branch **`br-patient-cake-ba0eaq14`** in the
  development project. Verified its endpoint, applied the reviewed migration,
  and temporarily pointed only the feature preview at it. No test account was
  written to the retained development branch or another app's database.
- Branch deploy **`6ad2484eb17dfd9c76919820`** passed hosted checks:
  unauthenticated session returns **200/null**; Google sign-in initiation
  returns the Google authorization URL with the exact preview callback.
- The real restricted Resend key sent one sign-in email to a uniquely labelled
  **provider-owned `delivered+…@resend.dev` test address**, not a human inbox.
  Message **`01a1456a-eb05-75d2-953d-e0cee1a52abd`** reached **`delivered`**.
  Its sign-in URL and all cookie/token values stayed in process memory and
  were not printed or committed.
- The delivered link created a **Secure, HttpOnly** session. A session read
  returned the synthetic test user; reuse of the same link was rejected.
  Sign-out revoked the session and left zero sessions in the test database.
- Restored the retained development database URL, then redeployed as
  **`6ad2487d7a8cf49bb7db142c`** from `1be237f`. Session reads on that restored
  target return **200/null**. Deleted the test branch and verified absence.
  Cleanup was registered before creation, including interruption handling
  and a one-hour expiry fallback.
- Final Neon branch listing contains only the approved retained branch
  **`br-morning-pine-ba055d1b`**. No owned test branch remains. The provider's
  test message remains as delivery evidence; its magic link was consumed and
  its test database deleted, so it cannot provide a usable session.
- Preview HTML, JavaScript, and CSS load. A literal-value check found none of
  the four private configuration values in those served assets. This is a
  focused check, not a general secret-scanning guarantee.
- Production deploy **`6a1df450234f820008eea876`**, its `main` branch, and its
  environment fingerprint remain unchanged. Netlify remains on **Free**.

**Limits:** Google authorization initiation is not a completed Google login;
its client-secret exchange, consent audience, and test-user access still need
interactive verification. Delivery to Resend's test inbox is not proof of
delivery to the user's personal inbox. Account-backed garden storage, client
sign-in/import controls, and cross-device sync remain separate implementation.

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

At this merge-only checkpoint the package required Node 22.12+ in the Node 22
line, or Node 24+; the authentication test requirement above supersedes this.
Its isolated test runner uses Vitest 4.1.11 because the initially reused
3.2.4 dependency set had known audit findings. Existing web/mobile dependency
versions were not changed. No database, hosted service, or device was created
for this chunk; no native UI rerun was needed for this pure, unconnected module.

Coverage includes concurrent conversation additions, Unicode tie-breaking,
friend/interaction deletions, reused-version collisions, invalid snapshots,
canonicalization, output isolation, stable ordering, and materialized dates.
These are module tests, not proof of authenticated persistence or live sync.

## Questions before later chunks

- Resend domain verification and credentials (provider selected).
- Apple OAuth deferred until a later chunk (timing selected).
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
