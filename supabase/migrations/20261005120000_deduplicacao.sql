-- =====================================================================
-- Deduplicação multi-fonte (etapa 8 das melhorias).
--
-- • core.editais.canonical_key: "n:5/2026" (número/ano) ou "t:palavras-do-titulo".
-- • core.editais.possible_duplicate_of / possible_duplicate_reason: edital
--   parecido já cadastrado (a equipe decide; nada é escondido).
-- • core.edital_sightings: cada fonte/endereço onde o edital foi encontrado
--   (a origem e as repetições em outras fontes, com o motivo da correspondência).
-- edital_id / possible_duplicate_of usam o tipo de core.editais.id (uuid localmente;
-- pode ser bigint na tabela criada no painel do Supabase remoto).
-- Idempotente (ADR-0014).
-- =====================================================================

do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_id_type
  from pg_attribute a
  where a.attrelid = 'core.editais'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format(
    'alter table core.editais add column if not exists possible_duplicate_of %s references core.editais (id) on delete set null',
    v_id_type);

  execute format($ddl$
    create table if not exists core.edital_sightings (
      id             uuid primary key default gen_random_uuid(),
      org_id         uuid not null references core.organizations (id) on delete cascade,
      edital_id      %s not null references core.editais (id) on delete cascade,
      source_id      uuid references core.edital_sources (id) on delete set null,
      url            text not null check (url ~ '^https?://' and char_length(url) <= 2000),
      title          text check (title is null or char_length(title) <= 300),
      match_reason   text not null check (char_length(match_reason) <= 300),
      first_seen_at  timestamptz not null default now(),
      last_seen_at   timestamptz not null default now(),
      unique (org_id, edital_id, url)
    )
  $ddl$, v_id_type);
end;
$$;

alter table core.editais
  add column if not exists canonical_key              text,
  add column if not exists possible_duplicate_reason  text;

create index if not exists editais_org_canonical_idx on core.editais (org_id, canonical_key);
create index if not exists edital_sightings_edital_idx on core.edital_sightings (edital_id, first_seen_at);
create index if not exists edital_sightings_org_url_idx on core.edital_sightings (org_id, url);

comment on column core.editais.canonical_key is 'Chave de deduplicação: n:<número>/<ano> ou t:<palavras do título>.';
comment on column core.editais.possible_duplicate_of is 'Edital parecido já cadastrado (possível duplicado; decisão da equipe).';
comment on column core.editais.possible_duplicate_reason is 'Por que parece duplicado (ex.: títulos parecidos 70%).';
comment on table core.edital_sightings is 'Onde cada edital foi encontrado (fonte, endereço, datas e motivo da correspondência).';

alter table core.edital_sightings enable row level security;

drop policy if exists "edital_sightings_select_members" on core.edital_sightings;
create policy "edital_sightings_select_members" on core.edital_sightings
  for select to authenticated using (core.has_role(org_id, 'viewer'));
drop policy if exists "edital_sightings_delete_editors" on core.edital_sightings;
create policy "edital_sightings_delete_editors" on core.edital_sightings
  for delete to authenticated using (core.has_role(org_id, 'editor'));

grant select, delete on core.edital_sightings to authenticated;
grant all on core.edital_sightings to service_role;
