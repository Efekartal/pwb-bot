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
  whatsapp_id text unique,
  whatsapp_name text,
  role text not null default 'Topluluk',
  status public.pwb_status not null default 'Aday Havuzu',
  creative_owner text,
  last_activity_at timestamptz,
  contribution_level text not null default 'Yeni',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wa_groups (
  id uuid primary key default gen_random_uuid(),
  wa_jid text not null unique,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text not null unique,
  group_id uuid references public.wa_groups(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  sender_wa_id text,
  chat_jid text not null,
  chat_name text,
  message_type text not null,
  text_content text,
  media_metadata jsonb not null default '{}'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index messages_person_sent_at_idx on public.messages(person_id, sent_at desc);
create index messages_group_sent_at_idx on public.messages(group_id, sent_at desc);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  type text not null,
  reason text not null,
  recommendation public.pwb_status,
  proposed_message text,
  dedupe_key text unique,
  state text not null default 'pending' check (state in ('pending','approved','held','rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index approvals_state_created_at_idx on public.approvals(state, created_at desc);
create index approvals_person_id_idx on public.approvals(person_id);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  to_jid text not null,
  body text not null,
  state text not null default 'pending' check (state in ('pending','claimed','sent','failed','cancelled')),
  claim_token text,
  claimed_at timestamptz,
  sent_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index outbox_state_created_at_idx on public.outbox(state, created_at);
create index outbox_person_id_idx on public.outbox(person_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_person_created_at_idx on public.activity_log(person_id, created_at desc);

alter table public.people enable row level security;
alter table public.wa_groups enable row level security;
alter table public.messages enable row level security;
alter table public.approvals enable row level security;
alter table public.outbox enable row level security;
alter table public.activity_log enable row level security;

create policy "authenticated can manage people" on public.people for all to authenticated using (true) with check (true);
create policy "authenticated can manage groups" on public.wa_groups for all to authenticated using (true) with check (true);
create policy "authenticated can read messages" on public.messages for select to authenticated using (true);
create policy "authenticated can manage approvals" on public.approvals for all to authenticated using (true) with check (true);
create policy "authenticated can manage outbox" on public.outbox for all to authenticated using (true) with check (true);
create policy "authenticated can read logs" on public.activity_log for select to authenticated using (true);
