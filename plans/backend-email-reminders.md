# Backend email reminders

## First slice

- Email reminders are off by default. Sign-in and sync consent do not turn
  them on. Require a separate opt-in for the verified account email only.
- Keep native reminder settings on each device. Enabling or disabling email
  must not change local reminders. Tell users they can leave either channel off.
- Send at most one digest per account per local calendar day. Start with a
  generic notice that a check-in is due. Do not include friend names, notes,
  birthdays, or sign-in tokens in subject lines, body text, or delivery logs.
- Keep the current backup behavior. Email reminders do not change import,
  export, account consent, or deletion rules.

## Implementation order

1. Test reminder eligibility and delivery keys locally, with a fake clock and
   no network calls. The digest planner uses the account's time zone and
   calendar dates for cadence checks. It does not schedule or send email.
2. Add account-scoped preferences and durable send claims. Test duplicate job
   invocations, concurrent workers, and retry after an uncertain send. Use the
   same provider idempotency key on retry and stop retries before it expires.
3. Add account settings to manage consent and opt out. Recheck consent and the
   verified address before delivery. Do not send queued reminders after opt-out
   or an address change. Keep bounced and complained addresses suppressed.
4. Add Resend and a scheduled function behind a disabled-by-default switch.
   Verify with a disposable database and the provider test sink only after
   separate approval for the hosted changes. Do not enable production delivery.

## Storage checks — 2026-11-20

The preference store and delivery claims are implemented, but no route or job
uses them. The account and local date form the daily delivery key. A delivery
claim expires after five minutes and can be retried for up to one hour from the
first claim. Retry uses the same message and idempotency key. Opt-out removes
the preference, not the daily delivery record. A fresh opt-in cannot resume a
claim from a previous opt-in. The worker rechecks the preference before calling
the sender; a provider request already in flight cannot be recalled.

Local PostgreSQL 15 checks used the three migrations and a fake sender. They
verified that only one of eight concurrent workers submitted a digest, an
uncertain send reused the same key, a stale worker could not acknowledge a new
claim, and expired claims, address changes, and opt-out blocked delivery. The
database was removed. No hosted migration, scheduled job, or email was run.

To repeat the check, start a fresh local PostgreSQL cluster with role
`fg_reminder_fixture`, port 5432, no TCP listener, and a private Unix socket
directory named `fg-reminder-db.*`. From the repository root, run
`node --experimental-strip-types apps/api/scripts/check-email-reminders.mts <absolute-socket-directory>`.
Stop the cluster and remove its data after the check.

## Account settings — 2026-11-20

Web and native account settings now load and save the email preference through
the signed-in account. Opening the controls does not opt in. Enabling uses the
current verified address and the device time zone. A signed-in user can opt
out without opening the account garden. These controls do not change local
reminders or upload garden data. No scheduled job or live sender is active.

Automated checks passed: 163 web tests, 151 API tests, 237 mobile tests, and
type checks for all three packages. Browser and native tests used fake account
requests; the settings route was not deployed or tested on an emulator.

## Preview delivery — 2026-11-20

The Resend sender and feedback route are implemented for an isolated preview
only. Both stay off unless the deploy context is a branch deploy or deploy
preview and `EMAIL_REMINDER_DELIVERY` is `preview-test`. The test database
must match the preview API database, and the configured recipient must be a
Resend test inbox. The job uses only that one account. The published
production context cannot send. Netlify does not run scheduled functions
automatically on branch deploys or deploy previews; invoke the function with
**Run now** for hosted verification.

The feedback route verifies the signature over the original request body. It
accepts permanent bounces, complaints, and suppression events for the tagged
reminder addressed to the configured inbox. Repeated events leave one hashed
address record. Delivery checks this record both at claim time and before
calling the sender. Sign-in email is not affected.

Local checks passed: 155 API tests and a disposable PostgreSQL 15 check with
all four migrations. The PostgreSQL check ran the preview worker with a fake
sender, verified at most one submission and verified suppression. Signed
webhook tests used the actual Resend SDK verifier and synthetic payloads. No
provider call, hosted migration, or deploy occurred.

Hosted acceptance needs approval to push the preview branch, create and
migrate a disposable development database, set preview-only test values,
register the test webhook, and submit to the Resend test sink. Verify consent,
manual job invocation, duplicate prevention, and feedback with synthetic
data. Restore the preview settings and remove the test webhook and database.
Do not enable mail to real addresses. Production rollout is not part of this
preview slice.

## Hosted preview verification — 2026-11-21

On source `70785a7`, the isolated branch deploy `6b00d179e461ae8dcd8d76b5`
passed the session, default-off, explicit opt-in, synthetic garden, and
opt-out checks. A manual job invocation submitted one message to a Resend
bounce test address. Resend accepted the request, then returned a signed bounce
event. The address was suppressed, and a second invocation skipped without
creating a second delivery record. An unsigned webhook request returned 401.
This was a bounce test, not proof of inbox delivery.

The previous preview source `b146d7f` was restored in deploy
`6b00d205f0d790ab5518fd86`. The home page, anonymous session response, and
unauthenticated garden response passed. Both test deploys
(`6b00d060a66d1152a4e90acb`, `6b00d179e461ae8dcd8d76b5`) and all temporary
environment values were removed. The disposable database branches and webhooks
from this run, including setup retries, were removed:

| Disposable database branch | Temporary webhook |
| --- | --- |
| `br-twilight-shape-baqrn6n4` | `114e1000-5a8d-4b1a-b716-16934a09e275` |
| `br-morning-smoke-basulnmp` | `b5edbed3-143a-4afb-984d-8c9f3faa2157` |
| `br-withered-mode-baqta4an` | `5d5776df-4dee-4b2a-a2e3-6c9fee963226` |

Production did not change. The feature branch contains the reminder code, but
the retained preview still uses the previous source and has no reminder tables.
Leave delivery off. A retained preview rollout needs separate approval for the
guarded migrations and redeploy. No simulator or emulator checks ran here.
