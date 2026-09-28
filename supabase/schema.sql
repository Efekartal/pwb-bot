create extension if not exists pgcrypto;

create type public.pwb_status as enum (
  'Aktif',
  'Gelişim',
  'Geri Dönüş',
  'Yeni Aday',
  'Beklemede',
  'Aday Havuzu'
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text unique,
  role text not null default 'Güreşçi',
  status public.pwb_status not null default 'Yeni Aday',
  creative_owner text,
  last_activity_at timestamptz,
  contribution_level text not null default 'Yeni',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  type text not null,
  reason text not null,
  recommendation public.pwb_status,
  proposed_message text,
  state text not null default 'pending' check (state in ('pending','approved','held','rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.people enable row level security;
alter table public.approvals enable row level security;
alter table public.activity_log enable row level security;

create policy "authenticated can read people" on public.people for select to authenticated using (true);
create policy "authenticated can manage people" on public.people for all to authenticated using (true) with check (true);
create policy "authenticated can manage approvals" on public.approvals for all to authenticated using (true) with check (true);
create policy "authenticated can manage logs" on public.activity_log for all to authenticated using (true) with check (true);
