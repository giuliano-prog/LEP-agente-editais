-- =====================================================================
-- Classificador de páginas e configuração por fonte (etapa 6 das melhorias).
--
-- • core.editais.page_type / opportunity_kind / page_type_reasons: como a
--   varredura classificou a página (oportunidade ou incerta) e por quê.
-- • core.edital_sources.adapter_config: regras simples por fonte (exclusões por
--   endereço/título, limite de importações, PDFs). Sem seletores CSS.
-- • core.monitor_ignored_urls: páginas que a varredura NÃO transformou em edital
--   (resultado, retificação, notícia, institucional, índice), com o motivo.
--   Ficam visíveis em Fontes; um administrador pode pedir reavaliação (apagar).
-- • core.monitor_runs.ignored_pages: contador por execução.
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.editais
  add column if not exists page_type          text,
  add column if not exists opportunity_kind   text,
  add column if not exists page_type_reasons  text[] not null default '{}';

alter table core.editais drop constraint if exists editais_page_type_check;
alter table core.editais
  add constraint editais_page_type_check check (page_type is null or page_type in ('opportunity', 'uncertain'));
alter table core.editais drop constraint if exists editais_opportunity_kind_check;
alter table core.editais
  add constraint editais_opportunity_kind_check check (opportunity_kind is null or opportunity_kind in (
    'edital', 'call', 'award', 'contest', 'accreditation', 'selection', 'program', 'festival', 'lab', 'other'));

comment on column core.editais.page_type is 'Classificação da página pela varredura: opportunity | uncertain (null = cadastro manual/anterior).';
comment on column core.editais.opportunity_kind is 'Tipo de oportunidade: edital | call | award | contest | accreditation | selection | program | festival | lab | other.';
comment on column core.editais.page_type_reasons is 'Sinais que fundamentaram a classificação (explicação).';

alter table core.edital_sources
  add column if not exists adapter_config jsonb not null default '{}'::jsonb;
alter table core.edital_sources drop constraint if exists edital_sources_adapter_config_check;
alter table core.edital_sources
  add constraint edital_sources_adapter_config_check check (
    jsonb_typeof(adapter_config) = 'object' and pg_column_size(adapter_config) <= 16384);

comment on column core.edital_sources.adapter_config is 'Regras da fonte: linkExcludes, titleExcludes, maxImports, classifyPages, allowPdfLinks (validadas no app; inválidas = padrão).';

grant insert (adapter_config), update (adapter_config) on core.edital_sources to authenticated;

alter table core.monitor_runs
  add column if not exists ignored_pages integer not null default 0;
comment on column core.monitor_runs.ignored_pages is 'Páginas lidas e não transformadas em edital (resultado, notícia, institucional…).';

create table if not exists core.monitor_ignored_urls (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references core.organizations (id) on delete cascade,
  source_id      uuid references core.edital_sources (id) on delete cascade,
  url            text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title          text check (title is null or char_length(title) <= 300),
  page_type      text not null check (page_type in ('listing', 'result', 'rectification', 'news', 'institutional')),
  reasons        text[] not null default '{}',
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (org_id, url)
);

create index if not exists monitor_ignored_urls_org_seen_idx on core.monitor_ignored_urls (org_id, last_seen_at desc);

comment on table core.monitor_ignored_urls is 'Páginas que a varredura leu e não transformou em edital, com o motivo (não são lidas de novo até alguém pedir reavaliação).';

alter table core.monitor_ignored_urls enable row level security;

drop policy if exists "monitor_ignored_urls_select_members" on core.monitor_ignored_urls;
create policy "monitor_ignored_urls_select_members" on core.monitor_ignored_urls
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "monitor_ignored_urls_delete_admins" on core.monitor_ignored_urls;
create policy "monitor_ignored_urls_delete_admins" on core.monitor_ignored_urls
  for delete to authenticated using (core.has_role(org_id, 'admin'));

grant select, delete on core.monitor_ignored_urls to authenticated;
grant all on core.monitor_ignored_urls to service_role;
