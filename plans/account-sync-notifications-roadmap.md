# Roadmap Stub: Account Sync And Backend Notifications

> Source context: `plans/native-mobile-migration.md` and the decision to move future hosted infrastructure toward Netlify DNS/hosting, Netlify Functions, Neon, and Better Auth.

## Goal

Define the post-mobile direction for adding account-backed sync and backend-driven notification options while preserving Friendship Garden's calm, private, local-first product feel.

This document is an implementation handoff for future planning. It records decisions and rationale, not file-level implementation instructions.

## Current Roadmap

1. **Basic web app**: done. The current Vite + React app remains the stable local-first fallback.
2. **Native mobile migration**: as of 2026-10-16, Phases 1–6 are implemented and Phase 7 is complete within the agreed simulator/emulator scope. See `plans/native-mobile-migration.md` for current status and `plans/noqa-mobile-testing.md` for evidence and limits. Physical testing is excluded, not claimed as passed; this is not production-release validation. Shared-core extraction remains optional.
3. **Account-backed sync foundation**: add Better Auth, Netlify Functions, and Neon so a single user can sync their own garden across devices.
4. **Backend notification channels**: extend reminders beyond native local notifications through a pluggable backend notification layer, with email as the first implemented channel.
5. **Sync refinement**: improve conflict handling, first-sign-in import flows, and cross-device UX after the foundation exists.

### Active implementation — 2026-10-19

The first account-sync foundation chunk is implemented: an isolated merge
contract in `apps/api`, committed as `4be7258`. Authentication bootstrap now
adds Google + Resend magic links and a fail-closed Netlify handler, with
**139 API tests** passing. PostgreSQL migrations now pass real isolated tests
and are applied to the separate development project. Branch-only credentials
are configured; hosted passwordless sign-in and real Resend test-inbox delivery
pass. Account-scoped storage and transactional garden merges now also pass
real PostgreSQL checks, including concurrent writes and account isolation.
Web sign-in, explicit import consent, account-isolated offline queues, and
sync controls now pass **159 web tests** and synthetic browser checks. Native
provider authentication, correlated secure callbacks, account controls, and the
async persistence/queue/transport integration pass **231 mobile tests** and both
Release builds. Sign-in still requires explicit sync consent; local gardens and
reminders remain independent. Completed Google consent, personal inbox delivery,
and physical-phone checks remain deferred to one final user-run pass. See
`plans/account-sync-foundation.md` for chunk status, invariants, and remaining
setup questions. Native Phase 7 is committed in `89462d9`
(fix/tests) and `e3f497b` (roadmap/evidence). Account sync is available only in
explicitly configured builds and remains opt-in.

Hosted native-protocol consent, offline merging, tombstones, and revocation now
pass with real backend/provider test-sink delivery and injected client stores.
A focus/foreground consent-cancellation race is fixed in both clients. The
post-fix hosted browser email, consent, import, and sign-out round trip passes.
Android and iOS simulator Google launch/cancellation pass without credentials;
completed provider consent, native email return, and phone acceptance stay open.

The approved feature-branch preview is now live at
<https://feature-mobile-app-creation--friendship-garden.netlify.app>.
Resend domain `auth.friendship-garden.arthurnun.es` and its DNS records are
verified. Server configuration and development database setup are present;
hosted passwordless session creation, replay rejection, and sign-out pass on
an owned disposable test database, since deleted. The preview is restored to
its retained development database. The user approved masked
branch-only secrets with build access to stay on Netlify Free. Production
remains on its previous `main` deployment.

## Durable Decisions

- **Verification timing** (2026-10-17): continue implementation with agent-run automated checks; defer user-run Google/inbox/device verification until the integrated flow is ready. The user will then test Android and iPhone. Track pending manual checks explicitly and fix failures before closing that pass; do not block independent implementation on those checks now.
- **Auth provider**: Better Auth, not Clerk.
- **Auth rollout**: Google OAuth and passwordless email through Resend first. Apple OAuth remains planned but was explicitly deferred on 2026-10-16.
- **Backend runtime**: Netlify Functions.
- **Database**: Neon Postgres.
- **Sync scope**: single-user account sync only.
- **Notification model**: native local notifications remain the default; backend notifications are optional extensions.
- **Backend notification channels**: design as pluggable channels, but implement email first.
- **Data shape**: store structured server-side data, not encrypted opaque blobs.
- **Conflict model**: entity-level last-write-wins using timestamps, not CRDTs.
- **First sign-in behavior**: explicitly confirm importing local garden data into the account.

## Rationale

### Better Auth Over Clerk

Clerk is excellent at low usage, but its retained-user pricing can dominate the entire project at scale. Better Auth avoids per-user platform pricing and keeps auth contained in the application's own backend and database.

This choice is not free in engineering terms. Better Auth means the app owns session behavior, OAuth provider setup, account linking, rate limiting, schema migrations, email delivery for passwordless login, and auth-related incidents. That tradeoff is acceptable because this is a low-stakes product with simple auth needs.

### Netlify Functions And Neon

The project has moved toward Netlify DNS/hosting to avoid Cloudflare-related blocking risk in Spain. Netlify Functions keep the API close to the hosting platform.

Neon keeps Postgres independent from the hosting provider. That is healthier than coupling the data layer to Netlify Database unless Netlify's deploy-branching integration becomes more valuable than portability.

### Sync Foundation Before Backend Notifications

Backend notifications require trusted server-side friendship data: friends, interaction history, cadence, notification preferences, and delivery metadata. A server cannot responsibly send reminders before a minimal account-backed data foundation exists.

Therefore the backend phase should first establish authenticated storage and sync. Backend notification delivery should build on top of that foundation.

### Native Notifications Stay Primary

The native app should remain useful without a backend. Native local notifications preserve the original private, local-first promise and avoid making the product dependent on email delivery or server jobs.

Backend notifications are opt-in for users who want cross-device or inbox-based reminders.

### Single-User Sync Only

The garden belongs to one person. Shared gardens, collaboration, permissions, and multi-user editing would turn the product into a social/workspace system and add privacy and conflict complexity with little value.

Future implementation should not leave accidental seams that imply collaborative editing is expected.

### Structured Data Over Encrypted Blobs

Structured data makes sync, backend reminders, migrations, and support/debugging much simpler. This is a conscious privacy tradeoff because the original product was fully local and private.

If server-side data is introduced, the product should be honest about it: signed-in sync means the service stores relationship data needed to provide sync and optional backend reminders.

Encrypted sync may be revisited later, but it should not block the first useful sync implementation.

## Expected-But-Important Deviations

- The original web app intentionally had no accounts, backend, or cloud sync. Future sync changes that product boundary and must be treated as opt-in.
- Backend notifications should not replace native local notifications. They extend them.
- The backend notification phase should not become a generic notification platform. Use a pluggable shape, but ship one channel first.
- Passwordless email is included as a fallback even though Google + Apple are the primary auth paths. This avoids excluding users without requiring password storage.
- Last-write-wins is intentionally simple. The app is scoped to a small personal garden, not collaborative document editing.
- Server-side structured data is a deliberate privacy compromise made for practical sync and notification support.

## Open Questions For The Next Planning Session

- Resend's domain/key, branch configuration, and development schema are set up. Hosted delivery to the provider test inbox and passwordless sessions pass; completed Google consent and personal inbox delivery remain unverified.
- Apple OAuth is deferred from the first auth chunk; its later provider setup and HTTPS return URL remain to be arranged.
- What user-facing copy explains the privacy change when enabling sync?
- What reminder preferences belong locally only versus synced across devices?
- What is the minimum useful backend notification channel after email?
- Should signed-in users still be able to export/import JSON manually?
