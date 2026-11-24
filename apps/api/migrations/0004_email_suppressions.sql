create table public.email_reminder_suppressions (
  address_hash bytea primary key,
  suppressed_at timestamptz not null default statement_timestamp(),
  check (octet_length(address_hash) = 32)
);
