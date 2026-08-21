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
