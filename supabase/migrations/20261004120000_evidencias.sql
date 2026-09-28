-- =====================================================================
-- Extração ampliada com evidência por campo (etapa 7 das melhorias).
--
-- • core.editais.field_evidence: para cada campo sugerido pelas regras (prazo,
--   abertura, valores, quantidade de projetos, formatos, gêneros, estágios), o
--   valor, o trecho do texto e a origem (página ou PDF do regulamento).
--   Ex.: {"deadline": {"value": "2026-11-30", "snippet": "…", "source": "pdf"}}
-- • core.editais.extraction_notes: avisos da extração (ex.: PDF digitalizado sem
--   texto, página e PDF com valores diferentes).
-- Tudo é sugestão para revisão humana (ADR-0009). Idempotente (ADR-0014).
-- =====================================================================

alter table core.editais
  add column if not exists field_evidence    jsonb not null default '{}'::jsonb,
  add column if not exists extraction_notes  text[] not null default '{}',
  add column if not exists extracted_at      timestamptz;

alter table core.editais drop constraint if exists editais_field_evidence_check;
alter table core.editais
  add constraint editais_field_evidence_check check (
    jsonb_typeof(field_evidence) = 'object' and pg_column_size(field_evidence) <= 65536);

comment on column core.editais.field_evidence is 'Evidência por campo extraído: {campo: {value, snippet, source: page|pdf, label}}; "conflicts": campos em que página e PDF divergem.';
comment on column core.editais.extraction_notes is 'Avisos da extração automática (PDF sem texto, divergências…).';
comment on column core.editais.extracted_at is 'Quando a extração automática rodou pela última vez.';
