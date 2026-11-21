# Web release: opt-in account sync and backups

**Status: draft. Do not merge or publish until the owner approves the
production setup and release.** The feature preview is not production.

## Scope

- Release the web app and its account-sync API. Keep the browser's local
  garden available without an account. Signing in does not upload it.
- Ship backup preview and explicit replacement. Only an account garden can
  sync the deletion of friends and history omitted from the replacement.
- Keep email reminder delivery off. Passwordless sign-in email is a separate
  auth channel, not a reminder. Do not enable reminder delivery or its
  webhook. Native source is included in the release branch history, but this
  PR does not build, sign, submit, or release the native app.
- Keep the current production deployment unchanged during preparation. Use
  only a disposable database and synthetic accounts for hosted regression
  testing. Do not attach production secrets or data to a PR preview.

## Before the owner merges

- [ ] Confirm that `main` publishes to production. Record the current working
  production deploy ID in the private runbook for rollback. Confirm the
  candidate GitHub and Netlify checks pass. Keep the draft open if the merge
  base changes until the release diff and checks have been reviewed again.
- [ ] Provision a separate production PostgreSQL target, not the retained
  development database or a branch of it. Record its identity and recovery
  procedure privately. Check the backup/restore policy and confirm that the
  app runtime role can only access the database it needs.
- [ ] Have the owner review a production-only migration procedure with a
  pinned target, an ordered migration ledger, checksums, and a transaction.
  Rehearse it on a disposable database. Apply and verify `0001_auth.sql`,
  `0002_gardens.sql`, `0003_email_reminders.sql`, and
  `0004_email_suppressions.sql` before enabling the production account API.
  The existing `db:migrate:dev` command rejects production. Do not weaken its
  guard or run migrations in Netlify build or request handlers.
- [ ] Have the owner configure production-only server values for
  `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, and
  `AUTH_EMAIL_FROM`. Use the canonical production HTTPS origin. Use separate
  credentials and a restricted sign-in sender key; do not copy preview
  secrets into production, source control, or public build variables.
- [ ] Confirm the Google web callback matches the canonical production
  origin and `/api/auth/callback/google`. Confirm the intended OAuth audience,
  verified sign-in sender, and owner acceptance of the available sign-in
  methods. Actual Google consent and personal-inbox delivery have not been
  verified; the owner must complete those checks for public sign-in.
- [ ] Leave all `EMAIL_REMINDER_*` delivery values unset. The reminder UI can
  store preferences, but it must not promise active delivery. The current
  sender allows only test delivery in preview contexts.
- [ ] Confirm the privacy notice describes what opt-in sync stores and how
  users can request export or deletion. Approve a support contact and a
  retention policy before accepting other users' data.

## Smoke checks after the owner's release

1. Confirm the canonical home page returns `200` and that the loaded app is
   the approved build. In a fresh browser, try the local garden and local
   backup preview without signing in. Reload to check local persistence.
2. Confirm `GET /api/auth/get-session` returns `200` with no session,
   anonymous `GET /api/garden` and `GET /api/email-reminders` return `401`,
   and the disabled `POST /api/email-reminder-events` returns `404`.
3. The owner checks their approved sign-in methods and confirms that sign-in
   alone does not upload the local garden. Use the accepted staging evidence
   for destructive account flows; do not reset or replace a real garden to
   test release behavior.
4. Check function errors and latency for account routes. Do not capture
   personal garden data, cookies, or secrets in evidence or public logs.

## Rollback

If the local garden fails, auth or garden requests unexpectedly fail, sync
writes occur without consent, or data goes to the wrong target, stop the
rollout. The owner republishes the last known-good Netlify deploy and keeps
`main` from publishing the problem build again. Keep reminder delivery off.
Do not run down migrations, delete the database, or clear browser storage:
users may have account data or pending edits. Preserve backup and migration
history. Verify the local garden and its backup controls again. Record the
failed and restored deploys privately and confirm the impact before retrying.

## Release-candidate evidence

- [Post-merge preview checks](account-sync-notifications-roadmap.md#post-merge-preview-verification--2026-11-21)
  cover conflict recovery, backup replacement and synced deletion records,
  and guest garden preservation against a disposable PostgreSQL database.
- In Chromium at 360 × 480 CSS pixels, the backup preview previously collapsed
  to zero height with the account panel open. The candidate keeps the preview
  scrollable. With the built web app and a local mock API, real mouse clicks
  canceled without a write and confirmed a replacement with one sync write,
  both with the account panel open and with it closed.
  Repeat by opening the account panel, selecting the account garden, and
  importing a different one-friend backup twice. Scroll to the action buttons
  each time. Cancel the first import, then confirm the second. This checks
  browser layout and click behavior, not hosted or physical-device behavior.
- The web build and all three type checks passed. Test suites passed: 173 web,
  156 API, and 247 mobile (576 total).
