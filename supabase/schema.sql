-- Tau — run once in Supabase → SQL Editor (use the SAME project as Lodha Finance).
-- Replace the two UUIDs below with your and Neha's user IDs
-- (Supabase → Authentication → Users → copy the "UID" column). They are the same
-- UIDs your Lodha Finance RLS policies already use.

create table if not exists public.tau_state (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  rev         integer not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Compact numbers Lodha Finance reads to show a "Tau strategy" card.
create table if not exists public.tau_summary (
  id          text primary key,
  summary     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.tau_state   enable row level security;
alter table public.tau_summary enable row level security;

drop policy if exists "household full access" on public.tau_state;
create policy "household full access" on public.tau_state
  for all to authenticated
  using      (auth.uid() in ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (auth.uid() in ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

drop policy if exists "household full access" on public.tau_summary;
create policy "household full access" on public.tau_summary
  for all to authenticated
  using      (auth.uid() in ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (auth.uid() in ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

-- Live sync between devices
alter publication supabase_realtime add table public.tau_state;
