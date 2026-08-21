-- ============================================================
-- SUPABASE - Esquema do banco de dados (projeto "CuboAlertas")
-- ------------------------------------------------------------
-- COMO RODAR:
--   1. Acesse https://supabase.com → projeto CuboAlertas
--   2. Menu lateral: SQL Editor → New query
--   3. Cole este arquivo inteiro e clique em "Run"
-- ============================================================

-- Tabela de alertas / leads
create table if not exists public.alerts (
  id text primary key,
  name text not null,
  phone text,
  subject text,
  date text,
  time text,
  category text,
  notes text,
  status text default 'pending',
  created_at timestamptz default now(),
  completed_at timestamptz,
  completion_notes text
);

-- Tabela de configurações (opções do botão Adiar + avatar)
create table if not exists public.settings (
  key text primary key,
  value text
);

-- Valores padrão das configurações
insert into public.settings (key, value) values ('snoozes', '[15,30,60,1440]')
  on conflict (key) do nothing;
insert into public.settings (key, value) values ('avatar', 'null')
  on conflict (key) do nothing;
insert into public.settings (key, value) values ('sound', '"call"')
  on conflict (key) do nothing;

-- ------------------------------------------------------------
-- Segurança: permite que o app leia/grave com a chave pública
-- (anon). Para uso com login de usuário no futuro, troque essas
-- políticas por `auth.uid()`.
-- ------------------------------------------------------------
alter table public.alerts enable row level security;
alter table public.settings enable row level security;

create policy "acesso_total_alerts" on public.alerts
  for all using (true) with check (true);

create policy "acesso_total_settings" on public.settings
  for all using (true) with check (true);

-- ============================================================
-- WhatsApp LEADS - Gerenciamento de leads do WhatsApp
-- ============================================================

-- Tabela de leads
create table if not exists public.leads (
  id text primary key,
  name text not null,
  phone text,
  description text,
  renda text,
  regiao text,
  anuncio text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de observações dos leads (múltiplas por lead)
create table if not exists public.lead_observations (
  id text primary key,
  lead_id text not null references public.leads(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

-- Índices para performance
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_lead_obs_lead_id on public.lead_observations(lead_id);

-- RLS para leads
alter table public.leads enable row level security;
alter table public.lead_observations enable row level security;

create policy "acesso_total_leads" on public.leads
  for all using (true) with check (true);

create policy "acesso_total_lead_obs" on public.lead_observations
  for all using (true) with check (true);
