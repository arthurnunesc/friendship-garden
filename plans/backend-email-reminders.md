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
