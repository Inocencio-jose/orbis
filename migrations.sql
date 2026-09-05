-- Colunas novas na tabela groups
alter table groups add column if not exists admin_group_id text;
alter table groups add column if not exists rules text;
alter table groups add column if not exists welcome_message text;

-- Tabela de utilizadores banidos
create table if not exists banned_users (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  user_id text not null,
  user_jid text,
  reason text,
  banned_by text,
  created_at timestamptz default now()
);

-- Tabela de memória persistente da IA
create table if not exists contacts (
  jid text primary key,
  name text,
  phone text,
  updated_at timestamptz default now()
);

create table if not exists ai_memory (
  id uuid primary key default gen_random_uuid(),
  context_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists ai_memory_context_idx on ai_memory(context_id, created_at);
