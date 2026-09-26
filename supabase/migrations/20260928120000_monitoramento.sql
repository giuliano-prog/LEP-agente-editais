-- =====================================================================
-- Etapa 4 — Monitoramento automático de fontes de editais
--
-- • core.edital_sources: sites monitorados (listagem de editais de cada fonte).
-- • core.monitor_runs: histórico de cada varredura (auditoria e diagnóstico).
-- • core.editais: origem (manual | monitor), fonte e data de descoberta.
--   Editais descartados na triagem usam review_status = 'discarded' e não são
--   importados de novo (o link continua conhecido).
-- Varreduras rodam no servidor (Vercel Cron) com a chave de serviço; usuários
-- só leem o histórico.
-- =====================================================================

create table if not exists core.edital_sources (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references core.organizations (id) on delete cascade,
  name              text not null check (char_length(name) between 2 and 120),
  agency            text check (agency is null or char_length(agency) <= 200),
  list_url          text not null check (list_url ~ '^https?://' and char_length(list_url) <= 2000),
  audiovisual_only  boolean not null default true,
  link_contains     text check (link_contains is null or char_length(link_contains) <= 200),
  active            boolean not null default true,
  last_run_at       timestamptz,
  last_status       text check (last_status is null or last_status in ('ok', 'error', 'blocked')),
  last_error        text,
  last_imported     integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, list_url)
);

comment on table core.edital_sources is 'Fontes monitoradas pela varredura diária (página de listagem de editais).';
comment on column core.edital_sources.audiovisual_only is 'true: tudo na fonte é audiovisual (não exige termos de audiovisual no link).';
comment on column core.edital_sources.link_contains is 'Filtro opcional: o link do edital precisa conter este trecho (ex.: /editais/).';

drop trigger if exists edital_sources_set_updated_at on core.edital_sources;
create trigger edital_sources_set_updated_at before update on core.edital_sources
  for each row execute function core.set_updated_at();
drop trigger if exists edital_sources_audit on core.edital_sources;
create trigger edital_sources_audit
  after insert or update or delete on core.edital_sources
  for each row execute function core.audit_row_change();

create table if not exists core.monitor_runs (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references core.organizations (id) on delete cascade,
  source_id     uuid references core.edital_sources (id) on delete cascade,
  trigger       text not null check (trigger in ('cron', 'manual')),
  status        text not null check (status in ('ok', 'error', 'blocked')),
  links_found   integer not null default 0,
  candidates    integer not null default 0,
  imported      integer not null default 0,
  skipped       integer not null default 0,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists monitor_runs_org_started_idx on core.monitor_runs (org_id, started_at desc);

comment on table core.monitor_runs is 'Histórico das varreduras (uma linha por fonte por execução).';

alter table core.editais
  add column if not exists origin         text not null default 'manual',
  add column if not exists source_id      uuid references core.edital_sources (id) on delete set null,
  add column if not exists discovered_at  timestamptz;

comment on column core.editais.origin is 'manual | monitor (importado pela varredura automática).';
comment on column core.editais.review_status is 'pending | validated | discarded (descartado na triagem).';

create index if not exists editais_org_official_url_idx on core.editais (org_id, official_url);

-- RLS -----------------------------------------------------------------
alter table core.edital_sources enable row level security;
alter table core.monitor_runs enable row level security;

drop policy if exists "edital_sources_select_members" on core.edital_sources;
create policy "edital_sources_select_members" on core.edital_sources
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_sources_insert_admins" on core.edital_sources;
create policy "edital_sources_insert_admins" on core.edital_sources
  for insert to authenticated with check (core.has_role(org_id, 'admin'));
drop policy if exists "edital_sources_update_admins" on core.edital_sources;
create policy "edital_sources_update_admins" on core.edital_sources
  for update to authenticated
  using (core.has_role(org_id, 'admin'))
  with check (core.has_role(org_id, 'admin'));
drop policy if exists "edital_sources_delete_admins" on core.edital_sources;
create policy "edital_sources_delete_admins" on core.edital_sources
  for delete to authenticated using (core.has_role(org_id, 'admin'));

drop policy if exists "monitor_runs_select_members" on core.monitor_runs;
create policy "monitor_runs_select_members" on core.monitor_runs
  for select to authenticated using (core.has_role(org_id, 'viewer'));

grant select, delete on core.edital_sources to authenticated;
grant insert (org_id, name, agency, list_url, audiovisual_only, link_contains, active) on core.edital_sources to authenticated;
grant update (name, agency, list_url, audiovisual_only, link_contains, active) on core.edital_sources to authenticated;
grant select on core.monitor_runs to authenticated;
grant all on core.edital_sources, core.monitor_runs to service_role;
grant usage, select on all sequences in schema core to service_role;
