-- Versioned structured records, including tombstones, belong to one auth user.
create table public.gardens (
  user_id text primary key references public."user" (id) on delete cascade,
  snapshot jsonb not null,
  constraint gardens_snapshot_shape check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot @> '{"version":1}'::jsonb
    and jsonb_typeof(snapshot -> 'friends') = 'array'
    and jsonb_typeof(snapshot -> 'interactions') = 'array'
    and snapshot ?& array['version', 'friends', 'interactions']
  )
);
