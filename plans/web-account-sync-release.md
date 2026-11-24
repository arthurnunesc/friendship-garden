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
- [ ] Run the [owner database bootstrap](#owner-database-bootstrap) before
  enabling the production account API. It applies `0001_auth.sql`,
  `0002_gardens.sql`, `0003_email_reminders.sql`, and
  `0004_email_suppressions.sql`. The existing development command still
  refuses production. Migrations never run in Netlify builds or requests.
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

## Owner database bootstrap

This procedure is only for a fresh, separate Neon project. Do not run
`neon init`, `neon deploy`, or `neon env pull`: the application already uses
PostgreSQL, and these commands can copy production credentials into local
files. Do not use the development project, the admin URL in Netlify, or a
production URL in an `.env` file. Leave the release PR in draft.

1. In Neon, select the **production project**, then its **production** branch
   and `neondb`. In **Connect**, select the database owner and turn off
   **Connection pooling**. Confirm the branch and direct hostname in Neon.
   Save the owner connection string privately. The command below asks for the
   hostname separately so it can compare it with the connection string.
2. In the repository checkout containing this script, use Node 22.13+ on the
   Node 22 line, or Node 24+, and run `npm --prefix apps/api ci`.
3. In the same terminal, enter `bash`, then paste this function definition.
   The hidden prompts do not save either value in shell history or an env file.

   ```bash
   bootstrap_garden() (
     set +x
     set -o pipefail
     if [[ ${1:-} != --dry-run && ${1:-} != --apply ]]; then
       echo 'Use --dry-run or --apply.' >&2
       exit 1
     fi
     IFS= read -r -p 'Verified direct production hostname (no URL): ' host </dev/tty || exit 1
     IFS= read -rs -p 'Direct database owner connection string (hidden): ' owner_url </dev/tty || exit 1
     printf '\n' >/dev/tty
     if [[ $1 == --apply ]]; then
       IFS= read -rs -p 'Runtime role password (hidden): ' app_password </dev/tty || exit 1
       printf '\n' >/dev/tty
       printf '%s\n' "$owner_url" "$app_password"
     else
       printf '%s\n' "$owner_url"
     fi | npm --prefix apps/api run db:bootstrap:release -- "$1" "$host" neondb
   )
   ```

4. Run `bootstrap_garden --dry-run`. On a fresh target, expect four lines
   ending in `pending (read-only)`. The command rejects the pinned development
   host, the pooler, a non-owner connection, and unexpected public relations
   or ledger checksums. If it stops, do not proceed. Send only the stage and
   SQLSTATE.
5. Run `openssl rand -hex 32` and save that output privately as the new
   `friendship_garden_app` password. This is **not** `BETTER_AUTH_SECRET`.
   Run `bootstrap_garden --apply` with the same verified endpoint and enter the
   new runtime password when asked. Apply creates the four schema versions and
   limited role in one transaction. Expect four `applied` lines and `Runtime
   login verified`. A second dry run must report four `already applied`
   lines. If apply stops at `runtime login after commit`, the schema may
   already be in place. Do not drop it or generate a new password; report the
   stage and use the same saved runtime password for a retry.
6. In Neon **Connect**, choose `friendship_garden_app` and turn on
   **Connection pooling**. Save the pooled URL with that role's password (the
   password is hex and needs no escaping). If the dialog does not show the
   SQL-created role or its password, keep the pooled hostname, port, database,
   and query options shown for `neondb`, but replace the username and password
   with those for `friendship_garden_app`. Enter only this URL in Netlify as
   the Production value of `DATABASE_URL`. Leave preview keys unchanged.

The runtime role can read and write the app tables, but not change the schema
or read the migration ledger. A matching rerun verifies the ledger and will
not rotate the role password. Keep the owner credentials outside the app.

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
- On 2026-11-23, `npm --prefix apps/api run test:postgres:release` passed on
  disposable branch `br-nameless-water-ba3g6cew`, which was then deleted. It
  checked the four migrations, rollback, checksum checks, and synthetic
  sign-in and garden sync through the limited runtime role. The database
  bootstrap was not run on production. The API's 156 tests, type check, and
  web build also passed.
- On 2026-11-24, `npm --prefix apps/api run test:postgres` passed on disposable
  branch `br-orange-mud-ba8cuzth`, which was then deleted. The test now uses the
  same trusted client address handling as Netlify, so unrelated cases do not
  share a rate-limit bucket. It confirmed that one email link creates only
  one session and that the rate limit still works. This was a test-only change.
  No mail was sent. Real Google consent and personal-inbox sign-in still need
  owner verification.
