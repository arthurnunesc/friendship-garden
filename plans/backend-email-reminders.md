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
