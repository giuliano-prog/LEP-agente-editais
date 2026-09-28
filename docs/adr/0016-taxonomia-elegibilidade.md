# ADR-0016 — Taxonomia em três eixos e elegibilidade visível

**Status:** Aceita (2026-09-28)

## Contexto

A varredura marcava editais exclusivos de outros territórios como **descartados** (`review_status = 'discarded'`),
misturando a decisão da equipe (triagem) com a elegibilidade da LEP. Restrições (ex.: RioFilme, só para produtoras
cariocas) ficavam escondidas em "Descartados".

## Decisão

- Três eixos independentes em `core.editais`: **situação** (`status`), **triagem** (`review_status`) e
  **elegibilidade** (`eligibility_status`, com `eligibility_reason`, `eligibility_evidence`, `eligibility_source`).
- Elegibilidade: `eligible`, `not_eligible`, `not_confirmed`, `territorial_restriction`, `via_partner`,
  `individual`, `needs_review` (`packages/modules/funding/src/eligibility.ts`).
- Regras determinísticas e conservadoras: `not_eligible` **só por decisão humana** (com motivo); sem informação →
  `not_confirmed`; nacional com cotas regionais → `needs_review`.
- A varredura importa tudo que encontra como triagem pendente; restrições ficam visíveis com motivo e trecho.
- Decisão manual (`eligibility_source = 'manual'`) prevalece e não é sobrescrita pelas regras.
- Sem exceções fixas por instituição. `core.organizations.partner_territories` reserva espaço para parcerias futuras
  (sem tela): classifica como `via_partner`, nunca como elegível (diretriz nº 2).
- Migração `20261002120000_elegibilidade` converte os descartes **automáticos** antigos em restrição territorial
  pendente; descartes feitos por pessoas não mudam.

## Consequências

- Filtros da lista por eixo (Triagem · Elegibilidade · Situação); detalhe com abas (Dados, Elegibilidade, Match,
  Documentos, Histórico).
- O contador `monitor_runs.rejected` passa a significar "com restrição" (ainda importados, visíveis).
