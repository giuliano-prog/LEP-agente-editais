-- =====================================================================
-- Diretrizes LEP (docs/diretrizes-lep.md)
--   1. Elegibilidade territorial: LEP sediada em São Paulo/SP.
--   2. Proponente é sempre a própria LEP (parceiras não contam).
--
-- • core.organizations: sede do proponente (UF + município).
-- • core.editais: territórios aceitos para o proponente e motivo de descarte
--   automático na triagem (ex.: exclusivo de outro estado).
-- • core.monitor_runs: quantos editais foram rejeitados pelas diretrizes.
-- =====================================================================

alter table core.organizations
  add column if not exists hq_state text check (hq_state is null or hq_state ~ '^[A-Z]{2}$'),
  add column if not exists hq_city  text check (hq_city is null or char_length(hq_city) between 2 and 120);

comment on column core.organizations.hq_state is 'UF da sede do proponente (usada na elegibilidade territorial).';
comment on column core.organizations.hq_city is 'Município da sede do proponente.';

-- Sede da LEP Filmes (diretriz nº 1). Não sobrescreve valor já definido.
update core.organizations
set hq_state = 'SP', hq_city = 'São Paulo'
where slug = 'lep-filmes' and hq_state is null;

grant update (hq_state, hq_city) on core.organizations to authenticated;

alter table core.editais
  add column if not exists eligible_territories text[] not null default '{}',
  add column if not exists triage_reason        text;

comment on column core.editais.eligible_territories is 'Sede aceita para o proponente: "BR" (todo o país), "SP" (estado), "SP:São Paulo" (município). Vazio = não registrado.';
comment on column core.editais.triage_reason is 'Motivo do descarte automático (ex.: exclusivo para proponentes de outro estado).';

alter table core.monitor_runs
  add column if not exists rejected integer not null default 0;

comment on column core.monitor_runs.rejected is 'Editais encontrados e descartados automaticamente pelas diretrizes (ex.: território).';
