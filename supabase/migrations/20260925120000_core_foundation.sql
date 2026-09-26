-- =====================================================================
-- Etapa 0 — Fundação: schema `core`
--
-- Núcleo compartilhado por todos os módulos: organizações, perfis,
-- papéis (permissões), auditoria e registro de custos de IA.
-- Ver docs/adr/0003-banco-schemas-org-id-rls.md e 0005-papeis-permissoes.md
-- =====================================================================

create schema if not exists core;

grant usage on schema core to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------

-- A ordem dos valores define a hierarquia: viewer < editor < admin.
-- Deve permanecer igual a ROLES em packages/core/src/auth/roles.ts.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'core' and t.typname = 'app_role') then
    create type core.app_role as enum ('viewer', 'editor', 'admin');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------

create or replace function core.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists core.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 200),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table core.organizations is 'Organizações (tenant). Todo dado de negócio pertence a uma organização via org_id.';

-- Um perfil por usuário do Supabase Auth, criado automaticamente (trigger abaixo).
create table if not exists core.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text check (full_name is null or char_length(full_name) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table core.profiles is 'Dados públicos (dentro da organização) de cada usuário.';

create table if not exists core.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references core.organizations (id) on delete cascade,
  user_id     uuid not null references core.profiles (id) on delete cascade,
  role        core.app_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_id_idx on core.memberships (user_id);

comment on table core.memberships is 'Vínculo usuário ↔ organização com o papel (admin, editor, viewer).';

-- Sem FK em org_id de propósito: o histórico deve sobreviver à exclusão de registros.
create table if not exists core.audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid,
  actor_id      uuid,
  action        text not null check (action in ('insert', 'update', 'delete')),
  table_schema  text not null,
  table_name    text not null,
  record_id     text,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx on core.audit_log (org_id, created_at desc);

comment on table core.audit_log is 'Trilha de auditoria (quem alterou o quê e quando). Somente escrita via trigger.';

-- Registro de toda chamada de IA, independente do fornecedor (ADR-0006).
create table if not exists core.ai_usage (
  id                   bigint generated always as identity primary key,
  org_id               uuid not null references core.organizations (id) on delete cascade,
  purpose              text not null,
  provider             text not null,
  model                text not null,
  input_tokens         integer not null default 0 check (input_tokens >= 0),
  output_tokens        integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens  integer not null default 0 check (cached_input_tokens >= 0),
  cost_usd             numeric(12, 6) not null default 0 check (cost_usd >= 0),
  duration_ms          integer check (duration_ms is null or duration_ms >= 0),
  status               text not null check (status in ('success', 'error')),
  error_message        text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists ai_usage_org_created_idx on core.ai_usage (org_id, created_at desc);

comment on table core.ai_usage is 'Custos e consumo de IA por chamada. Base para limites e alertas futuros.';

-- updated_at automático
drop trigger if exists organizations_set_updated_at on core.organizations;
create trigger organizations_set_updated_at before update on core.organizations
  for each row execute function core.set_updated_at();
drop trigger if exists profiles_set_updated_at on core.profiles;
create trigger profiles_set_updated_at before update on core.profiles
  for each row execute function core.set_updated_at();
drop trigger if exists memberships_set_updated_at on core.memberships;
create trigger memberships_set_updated_at before update on core.memberships
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------
-- Funções de permissão (usadas pelas políticas RLS e pelo app)
--
-- SECURITY DEFINER evita recursão de RLS ao consultar memberships
-- dentro das próprias políticas de memberships.
-- ---------------------------------------------------------------------

create or replace function core.role_in_org(p_org_id uuid)
returns core.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from core.memberships m
  where m.org_id = p_org_id
    and m.user_id = (select auth.uid());
$$;

comment on function core.role_in_org is 'Papel do usuário autenticado na organização (null se não for membro).';

create or replace function core.has_role(p_org_id uuid, p_min_role core.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(core.role_in_org(p_org_id) >= p_min_role, false);
$$;

comment on function core.has_role is 'true se o usuário autenticado tem papel >= p_min_role na organização.';

revoke execute on function core.role_in_org(uuid) from public, anon;
revoke execute on function core.has_role(uuid, core.app_role) from public, anon;
grant execute on function core.role_in_org(uuid) to authenticated, service_role;
grant execute on function core.has_role(uuid, core.app_role) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Perfil automático para novos usuários do Supabase Auth
-- ---------------------------------------------------------------------

create or replace function core.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into core.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

create or replace function core.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update core.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function core.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function core.handle_user_email_change();

revoke execute on function core.handle_new_user() from public, anon, authenticated;
revoke execute on function core.handle_user_email_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Proteção: a organização nunca fica sem administrador
-- ---------------------------------------------------------------------

create or replace function core.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exclusões em cascata (organização ou usuário removidos) não são bloqueadas.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (
       select 1 from core.memberships m
       where m.org_id = old.org_id
         and m.role = 'admin'
         and m.id <> old.id
     )
  then
    raise exception 'A organização precisa manter pelo menos um administrador.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists memberships_keep_one_admin on core.memberships;
create trigger memberships_keep_one_admin
  before update or delete on core.memberships
  for each row execute function core.prevent_last_admin_removal();

revoke execute on function core.prevent_last_admin_removal() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Auditoria genérica (reutilizável pelos módulos futuros)
-- ---------------------------------------------------------------------

create or replace function core.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_org uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_table_schema = 'core' and tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  else
    v_org := coalesce(v_new ->> 'org_id', v_old ->> 'org_id')::uuid;
  end if;

  insert into core.audit_log
    (org_id, actor_id, action, table_schema, table_name, record_id, old_data, new_data)
  values
    (v_org, (select auth.uid()), lower(tg_op), tg_table_schema, tg_table_name,
     coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new);

  return null;
end;
$$;

comment on function core.audit_row_change is 'Trigger AFTER genérico de auditoria. Anexe a qualquer tabela com coluna id (e org_id).';

revoke execute on function core.audit_row_change() from public, anon, authenticated;

drop trigger if exists organizations_audit on core.organizations;
create trigger organizations_audit
  after insert or update or delete on core.organizations
  for each row execute function core.audit_row_change();
drop trigger if exists memberships_audit on core.memberships;
create trigger memberships_audit
  after insert or update or delete on core.memberships
  for each row execute function core.audit_row_change();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table core.organizations enable row level security;
alter table core.profiles      enable row level security;
alter table core.memberships   enable row level security;
alter table core.audit_log     enable row level security;
alter table core.ai_usage      enable row level security;

-- organizations: membros leem; administradores editam. Criação/exclusão só pelo servidor.
drop policy if exists "organizations_select_members" on core.organizations;
create policy "organizations_select_members" on core.organizations
  for select to authenticated
  using (core.has_role(id, 'viewer'));

drop policy if exists "organizations_update_admins" on core.organizations;
create policy "organizations_update_admins" on core.organizations
  for update to authenticated
  using (core.has_role(id, 'admin'))
  with check (core.has_role(id, 'admin'));

-- profiles: cada um vê o próprio perfil e o de quem está na mesma organização.
drop policy if exists "profiles_select_self_or_same_org" on core.profiles;
create policy "profiles_select_self_or_same_org" on core.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from core.memberships m
      where m.user_id = profiles.id
        and core.has_role(m.org_id, 'viewer')
    )
  );

drop policy if exists "profiles_update_self" on core.profiles;
create policy "profiles_update_self" on core.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: membros veem a equipe; somente administradores alteram.
drop policy if exists "memberships_select_members" on core.memberships;
create policy "memberships_select_members" on core.memberships
  for select to authenticated
  using (core.has_role(org_id, 'viewer'));

drop policy if exists "memberships_insert_admins" on core.memberships;
create policy "memberships_insert_admins" on core.memberships
  for insert to authenticated
  with check (core.has_role(org_id, 'admin'));

drop policy if exists "memberships_update_admins" on core.memberships;
create policy "memberships_update_admins" on core.memberships
  for update to authenticated
  using (core.has_role(org_id, 'admin'))
  with check (core.has_role(org_id, 'admin'));

drop policy if exists "memberships_delete_admins" on core.memberships;
create policy "memberships_delete_admins" on core.memberships
  for delete to authenticated
  using (core.has_role(org_id, 'admin'));

-- audit_log e ai_usage: somente administradores leem. Escrita apenas por trigger/servidor.
drop policy if exists "audit_log_select_admins" on core.audit_log;
create policy "audit_log_select_admins" on core.audit_log
  for select to authenticated
  using (core.has_role(org_id, 'admin'));

drop policy if exists "ai_usage_select_admins" on core.ai_usage;
create policy "ai_usage_select_admins" on core.ai_usage
  for select to authenticated
  using (core.has_role(org_id, 'admin'));

-- ---------------------------------------------------------------------
-- Privilégios de tabela (RLS filtra linhas; GRANT define operações possíveis)
-- `anon` (não autenticado) não tem acesso algum ao schema core.
-- ---------------------------------------------------------------------

grant select, update (name, slug) on core.organizations to authenticated;
grant select, update (full_name) on core.profiles to authenticated;
grant select, insert (org_id, user_id, role), update (role), delete on core.memberships to authenticated;
grant select on core.audit_log to authenticated;
grant select on core.ai_usage to authenticated;

grant all on all tables in schema core to service_role;
grant usage, select on all sequences in schema core to service_role;
