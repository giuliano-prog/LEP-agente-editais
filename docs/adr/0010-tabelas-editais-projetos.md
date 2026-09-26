# ADR-0010 — Tabelas `core.editais` e `core.projetos`

**Status:** Aceita (2026-09-26)

## Contexto

Os ADRs 0003 e 0007 previam um schema por módulo e nomes de tabelas em inglês.
Na Etapa 1, a LEP definiu as tabelas `core.editais` (já criada no Supabase remoto, pelo painel)
e `core.projetos`, ambas no schema `core`.

## Decisão

- Manter `core.editais` e `core.projetos` com esses nomes (exceção registrada aos ADRs 0003/0007).
  **Colunas** seguem em inglês (`title`, `format`, `deadline`...).
- `core.editais` passa a ser versionada por uma migração **conciliadora**
  (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`), que não altera nem apaga
  nada que já exista no remoto. A leitura no app é defensiva (`toEdital`), tolerando tipos diferentes.
- Vocabulário controlado de projetos (formato, gênero/tipologia, estágio) com códigos em inglês,
  definido em `packages/modules/projects` e espelhado em CHECK constraints do banco.
  As regras do edital usadas no Match (`accepted_formats`, `accepted_genres`, `accepted_stages`)
  usam os mesmos códigos.
- Status do edital: `open | upcoming | closed | suspended | under_review | result_published`
  (variações em português são normalizadas na leitura). Revisão: `pending | validated` (ADR-0009).

## Consequências

- Novas alterações de banco devem **sempre** ser feitas por migração, não pelo painel.
- Se futuramente os módulos forem separados em schemas próprios (ex.: `funding`), será uma migração
  de renomeação planejada, com novo ADR.
