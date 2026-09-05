-- Tabela principal de grupos
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  whatsapp_group_id text unique not null,
  name text,
  anti_link_enabled boolean default true,
  anti_spam_enabled boolean default true,
  anti_flood_enabled boolean default true,
  welcome_enabled boolean default true,
  warnings_limit integer default 3,
  admin_group_id text,
  rules text,
  welcome_message text,
  created_at timestamptz default now()
);

-- Avisos
create table if not exists warnings (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  user_id text not null,
  reason text,
  created_at timestamptz default now()
);

-- Denúncias
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  reported_user text,
  reported_by text,
  message_text text,
  created_at timestamptz default now()
);

-- Banidos
create table if not exists banned_users (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  user_id text not null,
  user_jid text,
  reason text,
  banned_by text,
  created_at timestamptz default now()
);

-- Logs
create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  group_id text,
  user_id text,
  action text,
  detail text,
  created_at timestamptz default now()
);

-- Memória IA
create table if not exists ai_memory (
  id uuid primary key default gen_random_uuid(),
  context_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);
create index if not exists ai_memory_context_idx on ai_memory(context_id, created_at);

-- Contactos
create table if not exists contacts (
  jid text primary key,
  name text,
  phone text,
  updated_at timestamptz default now()
);

-- Sessão WhatsApp persistente
create table if not exists sessions (
  file_name text primary key,
  content text not null,
  updated_at timestamptz default now()
);

-- Reputação de membros
create table if not exists reputation (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  user_id text not null,
  points integer default 0,
  level integer default 1,
  messages_count integer default 0,
  violations integer default 0,
  updated_at timestamptz default now(),
  unique(group_id, user_id)
);

-- Agendamentos recorrentes
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  message text not null,
  cron_expr text not null,
  active boolean default true,
  last_run timestamptz,
  created_at timestamptz default now()
);

-- Colunas adicionais em groups
alter table groups add column if not exists admin_group_id text;
alter table groups add column if not exists rules text;
alter table groups add column if not exists welcome_message text;
alter table groups add column if not exists link_whitelist text[];
alter table groups add column if not exists quiet_hours_start integer;
alter table groups add column if not exists quiet_hours_end integer;
alter table groups add column if not exists reputation_enabled boolean default false;
alter table groups add column if not exists daily_summary_enabled boolean default false;
alter table groups add column if not exists daily_summary_hour integer default 0;
