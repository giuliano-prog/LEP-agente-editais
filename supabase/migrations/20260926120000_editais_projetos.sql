-- =====================================================================
-- Etapa 1 — Editais e Projetos LEP
--
-- core.editais: a tabela foi criada inicialmente no Supabase remoto, fora das
-- migrações. Esta migração é CONCILIADORA e segura para rodar sobre ela:
--   • CREATE TABLE IF NOT EXISTS  → cria apenas se não existir;
--   • ADD COLUMN IF NOT EXISTS    → adiciona só as colunas que faltarem;
--   • nada é apagado, renomeado ou tem o tipo alterado.
-- Colunas que já existirem com tipo diferente são preservadas; o app normaliza
-- os valores na leitura (packages/modules/funding/src/edital.ts).
--
-- core.projetos: tabela nova (projetos da LEP).
-- =====================================================================

-- ---------------------------------------------------------------------
-- core.editais
-- ---------------------------------------------------------------------

create table if not exists core.editais (
  id uuid primary key default gen_random_uuid()
);

alter table core.editais
  add column if not exists id                      uuid default gen_random_uuid(),
  add column if not exists org_id                  uuid references core.organizations (id) on delete cascade,
  add column if not exists title                   text,
  add column if not exists agency                  text,
  add column if not exists status                  text,
  add column if not exists deadline                timestamptz,
  add column if not exists total_amount            numeric(14, 2),
  add column if not exists max_amount_per_project  numeric(14, 2),
  add column if not exists summary                 text,
  add column if not exists eligibility_criteria    text[] not null default '{}',
  add column if not exists categories              text[] not null default '{}',
  add column if not exists required_documents      text[] not null default '{}',
  add column if not exists official_url            text,
  add column if not exists official_links          jsonb not null default '[]'::jsonb,
  add column if not exists accepted_formats        text[] not null default '{}',
  add column if not exists accepted_genres         text[] not null default '{}',
  add column if not exists accepted_stages         text[] not null default '{}',
  add column if not exists min_budget              numeric(14, 2),
  add column if not exists max_budget              numeric(14, 2),
  add column if not exists review_status           text not null default 'pending',
  add column if not exists created_at              timestamptz not null default now(),
  add column if not exists updated_at              timestamptz not null default now();

comment on table core.editais is 'Editais/oportunidades de financiamento. Códigos de accepted_* seguem o vocabulário de @lep/projects.';
comment on column core.editais.status is 'open | upcoming | closed | suspended | under_review | result_published';
comment on column core.editais.review_status is 'pending | validated — nenhum edital é considerado validado sem revisão humana (ADR-0009).';
comment on column core.editais.deadline is 'Prazo final de inscrição (timestamptz; exibido no horário de Brasília).';

-- Registros antigos sem organização: se existir exatamente uma organização
-- (a LEP), eles passam a pertencer a ela. Sem org_id, o RLS os esconde.
update core.editais
set org_id = (select id from core.organizations limit 1)
where org_id is null
  and (select count(*) from core.organizations) = 1;

create index if not exists editais_org_deadline_idx on core.editais (org_id, deadline);

drop trigger if exists editais_set_updated_at on core.editais;
create trigger editais_set_updated_at before update on core.editais
  for each row execute function core.set_updated_at();

drop trigger if exists editais_audit on core.editais;
create trigger editais_audit
  after insert or update or delete on core.editais
  for each row execute function core.audit_row_change();

alter table core.editais enable row level security;

-- Políticas criadas somente se ainda não existirem (idempotente).
-- ATENÇÃO: políticas criadas manualmente no remoto com outros nomes continuam
-- valendo (políticas permissivas somam acessos). Revise-as — ver README.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = 'editais' and policyname = 'editais_select_members') then
    create policy "editais_select_members" on core.editais
      for select to authenticated
      using (core.has_role(org_id, 'viewer'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = 'editais' and policyname = 'editais_insert_editors') then
    create policy "editais_insert_editors" on core.editais
      for insert to authenticated
      with check (core.has_role(org_id, 'editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = 'editais' and policyname = 'editais_update_editors') then
    create policy "editais_update_editors" on core.editais
      for update to authenticated
      using (core.has_role(org_id, 'editor'))
      with check (core.has_role(org_id, 'editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = 'editais' and policyname = 'editais_delete_admins') then
    create policy "editais_delete_admins" on core.editais
      for delete to authenticated
      using (core.has_role(org_id, 'admin'));
  end if;
end;
$$;

revoke all on core.editais from anon;
grant select, insert, update, delete on core.editais to authenticated;
grant all on core.editais to service_role;

-- ---------------------------------------------------------------------
-- core.projetos
-- Códigos de format/genre/stage: packages/modules/projects/src/vocabulary.ts
-- ---------------------------------------------------------------------

create table if not exists core.projetos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references core.organizations (id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 200),
  format      text not null check (format in ('feature_film', 'short_film', 'series', 'tv_movie', 'other')),
  genre       text check (genre in ('fiction', 'documentary', 'animation', 'hybrid', 'other')),
  synopsis    text check (synopsis is null or char_length(synopsis) <= 5000),
  budget      numeric(14, 2) check (budget is null or budget >= 0),
  stage       text not null check (stage in ('development', 'pre_production', 'production', 'post_production', 'distribution', 'completed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projetos_org_created_idx on core.projetos (org_id, created_at desc);

comment on table core.projetos is 'Projetos da LEP (dados sigilosos). Base para o Match com editais.';

drop trigger if exists projetos_set_updated_at on core.projetos;
create trigger projetos_set_updated_at before update on core.projetos
  for each row execute function core.set_updated_at();
drop trigger if exists projetos_audit on core.projetos;
create trigger projetos_audit
  after insert or update or delete on core.projetos
  for each row execute function core.audit_row_change();

alter table core.projetos enable row level security;

drop policy if exists "projetos_select_members" on core.projetos;
create policy "projetos_select_members" on core.projetos
  for select to authenticated
  using (core.has_role(org_id, 'viewer'));

drop policy if exists "projetos_insert_editors" on core.projetos;
create policy "projetos_insert_editors" on core.projetos
  for insert to authenticated
  with check (core.has_role(org_id, 'editor'));

drop policy if exists "projetos_update_editors" on core.projetos;
create policy "projetos_update_editors" on core.projetos
  for update to authenticated
  using (core.has_role(org_id, 'editor'))
  with check (core.has_role(org_id, 'editor'));

drop policy if exists "projetos_delete_admins" on core.projetos;
create policy "projetos_delete_admins" on core.projetos
  for delete to authenticated
  using (core.has_role(org_id, 'admin'));

grant select, delete on core.projetos to authenticated;
grant insert (org_id, title, format, genre, synopsis, budget, stage) on core.projetos to authenticated;
grant update (title, format, genre, synopsis, budget, stage) on core.projetos to authenticated;
grant all on core.projetos to service_role;
