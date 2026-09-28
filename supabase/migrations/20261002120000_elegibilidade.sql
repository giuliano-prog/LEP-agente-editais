-- =====================================================================
-- Taxonomia em três eixos (etapa 5 das melhorias):
--   situação       core.editais.status          (o edital: aberto, encerrado…)
--   triagem        core.editais.review_status   (decisão da equipe: pendente, validado, descartado)
--   elegibilidade  core.editais.eligibility_status (a LEP pode ser a proponente?)
--
-- • Restrição territorial deixa de ser "descartado": vira eligibility_status =
--   'territorial_restriction', visível, com motivo e trecho (evidência).
-- • Editais descartados AUTOMATICAMENTE pela varredura (triage_reason começando
--   com "Descartado automaticamente") voltam para triagem pendente com a
--   restrição registrada. Descartes feitos por pessoas não são alterados.
-- • core.organizations.partner_territories: espaço para configurar parcerias no
--   futuro (hoje vazio, sem tela). Não torna a LEP elegível: só classifica como
--   'via_partner'.
-- Idempotente (ADR-0014).
-- =====================================================================

alter table core.editais
  add column if not exists eligibility_status      text not null default 'not_confirmed',
  add column if not exists eligibility_reason      text,
  add column if not exists eligibility_evidence    text,
  add column if not exists eligibility_source      text not null default 'auto',
  add column if not exists eligibility_checked_at  timestamptz;

alter table core.editais drop constraint if exists editais_eligibility_status_check;
alter table core.editais
  add constraint editais_eligibility_status_check check (eligibility_status in (
    'eligible', 'not_eligible', 'not_confirmed', 'territorial_restriction',
    'via_partner', 'individual', 'needs_review'));

alter table core.editais drop constraint if exists editais_eligibility_source_check;
alter table core.editais
  add constraint editais_eligibility_source_check check (eligibility_source in ('auto', 'manual'));

comment on column core.editais.eligibility_status is 'Elegibilidade da LEP como proponente: eligible | not_eligible (só decisão humana) | not_confirmed | territorial_restriction | via_partner | individual | needs_review.';
comment on column core.editais.eligibility_reason is 'Motivo da classificação de elegibilidade.';
comment on column core.editais.eligibility_evidence is 'Trecho do edital que fundamenta a classificação.';
comment on column core.editais.eligibility_source is 'auto (regras) | manual (definida pela equipe; a varredura não sobrescreve).';
comment on column core.editais.review_status is 'Triagem: pending | validated | discarded (decisão da equipe; não é usado para restrição territorial).';
comment on column core.editais.triage_reason is 'Motivo do descarte na triagem (legado: descartes automáticos anteriores à etapa 5).';

comment on column core.monitor_runs.rejected is 'Novos com restrição de elegibilidade (entram visíveis, em revisão). Antes da etapa 5: descartados automaticamente por território.';

create index if not exists editais_org_eligibility_idx on core.editais (org_id, eligibility_status);

-- Descartes automáticos antigos → restrição territorial visível, triagem pendente.
update core.editais
set eligibility_status     = 'territorial_restriction',
    eligibility_reason     = regexp_replace(
                               regexp_replace(triage_reason, '^Descartado automaticamente — ', ''),
                               ' Trecho: “.*”$', ''),
    eligibility_evidence   = substring(triage_reason from 'Trecho: “(.*)”$'),
    eligibility_source     = 'auto',
    eligibility_checked_at = coalesce(eligibility_checked_at, now()),
    review_status          = 'pending',
    triage_reason          = null
where review_status = 'discarded'
  and origin = 'monitor'
  and triage_reason like 'Descartado automaticamente%';

-- Espaço para parcerias futuras (sem tela nesta etapa).
alter table core.organizations
  add column if not exists partner_territories text[] not null default '{}';

comment on column core.organizations.partner_territories is 'Territórios com parceira local (futuro). Não tornam a LEP elegível: só classificam editais restritos como "via parceiro".';
