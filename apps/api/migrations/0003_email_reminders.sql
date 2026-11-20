create table public.email_reminder_preferences (
  user_id text primary key references public."user" (id) on delete cascade,
  email text not null,
  time_zone text not null,
  revision uuid not null
);

-- Keep the daily barrier even if the user opts out and back in.
create table public.email_reminder_deliveries (
  user_id text not null references public."user" (id) on delete cascade,
  local_day date not null,
  consent_revision uuid not null,
  lease_token uuid not null,
  lease_until timestamptz not null,
  retry_until timestamptz not null,
  accepted_at timestamptz,
  primary key (user_id, local_day)
);
