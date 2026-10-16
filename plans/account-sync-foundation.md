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
2. **Authenticated storage** — in progress. Authentication bootstrap is
   implemented and tested locally. Neon schema/migrations and account-scoped
   garden reads/writes are still pending. Test with an isolated database,
   never production credentials or data.
3. **Opt-in client sync** — pending. Explicitly confirm local-data import;
   keep local persistence and offline use working. Do not upload on sign-in.
4. **Recovery and verification** — pending. Test account switching/sign-out,
   retries, deletions, concurrent edits, backup compatibility, and reminders.

Backend reminder delivery remains a later scope. Do not introduce it here.

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

Tests use disposable, in-memory SQLite through Better Auth's supported Node
adapter and captured test-only email delivery. Docker is not running; do not
use Neon credentials or claim PostgreSQL integration from these tests. Live
PostgreSQL migrations, OAuth, email delivery, and deployment remain setup and
verification gates.

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

1. The approved branch preview and Resend sender domain are now provisioned
   and verified as recorded below. Configure branch-specific server settings
   before live sign-in; do not use production settings or data for testing.
   Keep credentials in the server environment, not chat or committed files.
   Google OAuth setup, an app-scoped sending key, and a separate development
   Neon project have not been configured by this task.
2. Add and verify PostgreSQL migrations in an owned disposable database, then
   verify Google OAuth and real Resend delivery with development credentials.
   No schema migration runs on an incoming authentication request.
3. Add authenticated, account-scoped garden storage and transactional merges.
   Authentication scaffolding alone is not account isolation or live sync.
4. Only then wire opt-in web/mobile clients and explicit local-import consent.

No production deployment or database migration has been run. Manual JSON backups,
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
