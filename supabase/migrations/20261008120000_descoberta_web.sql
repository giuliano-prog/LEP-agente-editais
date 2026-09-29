-- =====================================================================
-- Descoberta web de oportunidades audiovisuais + fontes favoritas (ADR-0024).
--
-- • core.edital_sources.is_favorite: fonte favorita ⭐ (destaque e prioridade;
--   NUNCA limita a busca geral).
-- • core.edital_sources.origin: como a fonte entrou (manual | suggested |
--   catalog | web_discovery).
-- • core.editais.origin passa a aceitar 'web_discovery' (coluna já existente, sem CHECK).
-- • core.discovery_runs: métricas de cada execução da descoberta web.
-- • core.discovery_candidates: cada endereço analisado pela descoberta (origem,
--   fonte oficial, decisão audiovisual com evidência, status). Serve para
--   rastreabilidade, para não reprocessar o mesmo endereço e para a fila curta de
--   "incertos". Uso técnico (admin): NÃO é vitrine de oportunidades descartadas.
-- edital_id usa o tipo de core.editais.id (uuid localmente; pode ser bigint remoto).
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.edital_sources
  add column if not exists is_favorite boolean not null default false,
  add column if not exists origin      text    not null default 'manual';

alter table core.edital_sources drop constraint if exists edital_sources_origin_check;
alter table core.edital_sources
  add constraint edital_sources_origin_check check (origin in ('manual', 'suggested', 'catalog', 'web_discovery'));

comment on column core.edital_sources.is_favorite is 'Fonte favorita ⭐: destaque e prioridade de verificação (não restringe a descoberta geral).';
comment on column core.edital_sources.origin is 'Como a fonte foi cadastrada: manual | suggested | catalog | web_discovery.';
comment on column core.editais.origin is 'manual | monitor (varredura de fonte cadastrada) | web_discovery (descoberta web).';

grant insert (is_favorite, origin), update (is_favorite) on core.edital_sources to authenticated;

create index if not exists edital_sources_org_favorite_idx on core.edital_sources (org_id, is_favorite);

-- Execuções -----------------------------------------------------------------
create table if not exists core.discovery_runs (
  id                     bigint generated always as identity primary key,
  org_id                 uuid not null references core.organizations (id) on delete cascade,
  trigger                text not null check (trigger in ('cron', 'manual')),
  status                 text not null check (status in ('ok', 'partial', 'error', 'not_configured')),
  provider               text check (provider is null or char_length(provider) <= 40),
  queries_planned        integer not null default 0,
  queries_run            integer not null default 0,
  results_received       integer not null default 0,
  unique_urls            integer not null default 0,
  analyzed               integer not null default 0,
  audiovisual_yes        integer not null default 0,
  audiovisual_no         integer not null default 0,
  audiovisual_uncertain  integer not null default 0,
  official_found         integer not null default 0,
  imported               integer not null default 0,
  duplicates             integer not null default 0,
  already_known          integer not null default 0,
  new_sources            integer not null default 0,
  failed                 integer not null default 0,
  blocked                integer not null default 0,
  provider_limited       boolean not null default false,
  queries                text[] not null default '{}',
  error                  text check (error is null or char_length(error) <= 500),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz
);

create index if not exists discovery_runs_org_started_idx on core.discovery_runs (org_id, started_at desc);

comment on table core.discovery_runs is 'Histórico da descoberta web (uma linha por organização por execução), com as métricas.';

-- Candidatos ------------------------------------------------------------------
do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists core.discovery_candidates (
      id                     uuid primary key default gen_random_uuid(),
      org_id                 uuid not null references core.organizations (id) on delete cascade,
      url                    text not null check (url ~ '^https?://' and char_length(url) <= 2000),
      host                   text not null check (char_length(host) <= 255),
      site_kind              text not null check (site_kind in ('official', 'known_source', 'aggregator', 'news', 'unknown')),
      title                  text check (title is null or char_length(title) <= 300),
      snippet                text check (snippet is null or char_length(snippet) <= 1000),
      query                  text check (query is null or char_length(query) <= 300),
      official_url           text check (official_url is null or (official_url ~ '^https?://' and char_length(official_url) <= 2000)),
      official_host          text check (official_host is null or char_length(official_host) <= 255),
      official_reason        text check (official_reason is null or char_length(official_reason) <= 300),
      institution            text check (institution is null or char_length(institution) <= 200),
      audiovisual            text check (audiovisual is null or audiovisual in ('yes', 'no', 'uncertain')),
      audiovisual_reasons    text[] not null default '{}',
      audiovisual_evidence   text check (audiovisual_evidence is null or char_length(audiovisual_evidence) <= 500),
      status                 text not null check (status in ('imported', 'duplicate', 'suppressed', 'uncertain', 'failed', 'dismissed')),
      status_reason          text check (status_reason is null or char_length(status_reason) <= 300),
      edital_id              %s references core.editais (id) on delete set null,
      times_seen             integer not null default 1,
      first_seen_at          timestamptz not null default now(),
      last_seen_at           timestamptz not null default now(),
      unique (org_id, url)
    )
  $ddl$, v_id_type);
end;
$$;

create index if not exists discovery_candidates_org_status_idx on core.discovery_candidates (org_id, status, last_seen_at desc);
create index if not exists discovery_candidates_edital_idx on core.discovery_candidates (edital_id);
create index if not exists discovery_candidates_org_official_host_idx on core.discovery_candidates (org_id, official_host);

comment on table core.discovery_candidates is 'Endereços analisados pela descoberta web: origem, fonte oficial, decisão audiovisual (com evidência) e status. Uso técnico; não é lista de oportunidades.';
comment on column core.discovery_candidates.status is 'imported | duplicate (virou avistamento) | suppressed (não audiovisual/encerrado/não é oportunidade) | uncertain (aguarda confirmação) | failed | dismissed (descartado por admin).';

drop trigger if exists discovery_candidates_audit on core.discovery_candidates;
create trigger discovery_candidates_audit
  after update or delete on core.discovery_candidates
  for each row execute function core.audit_row_change();

-- RLS: só administradores (uso técnico). Escrita da descoberta = chave de serviço.
alter table core.discovery_runs enable row level security;
alter table core.discovery_candidates enable row level security;

drop policy if exists "discovery_runs_select_admins" on core.discovery_runs;
create policy "discovery_runs_select_admins" on core.discovery_runs
  for select to authenticated using (core.has_role(org_id, 'admin'));

drop policy if exists "discovery_candidates_select_admins" on core.discovery_candidates;
create policy "discovery_candidates_select_admins" on core.discovery_candidates
  for select to authenticated using (core.has_role(org_id, 'admin'));
drop policy if exists "discovery_candidates_update_admins" on core.discovery_candidates;
create policy "discovery_candidates_update_admins" on core.discovery_candidates
  for update to authenticated
  using (core.has_role(org_id, 'admin'))
  with check (core.has_role(org_id, 'admin'));
drop policy if exists "discovery_candidates_delete_admins" on core.discovery_candidates;
create policy "discovery_candidates_delete_admins" on core.discovery_candidates
  for delete to authenticated using (core.has_role(org_id, 'admin'));

grant select on core.discovery_runs to authenticated;
grant select, delete on core.discovery_candidates to authenticated;
grant update (status, status_reason) on core.discovery_candidates to authenticated;
grant all on core.discovery_runs, core.discovery_candidates to service_role;
grant usage, select on all sequences in schema core to service_role;
