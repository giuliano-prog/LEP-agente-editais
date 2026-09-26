# ADR-0013 — Diretrizes territoriais e foco exclusivo na LEP

**Status:** Aceita (2026-09-26) · Regras de negócio: [docs/diretrizes-lep.md](../diretrizes-lep.md)

## Decisão

1. **Sede do proponente** em `core.organizations` (`hq_state`, `hq_city`), definida como São Paulo/SP para a
   LEP Filmes pela migração `20260929120000`. Sem sede cadastrada, o sistema usa São Paulo/SP.
2. **Territórios aceitos do edital** em `core.editais.eligible_territories` (`BR` · UF · `UF:Município`).
3. **Análise por regras (sem IA)** em `assessTerritory`: procura exigências de sede/domicílio
   ("sediadas no Município de…", "com sede no Estado de…", "produtoras cariocas", "sede em RJ") e sinais de
   abrangência nacional. É **conservadora**: só declara inelegível com exigência explícita de outro território
   e sem indicação nacional; na dúvida, fica pendente para revisão humana.
4. **Varredura:** inelegível → `review_status = 'discarded'` + `triage_reason` com motivo e trecho; o link fica
   conhecido e não é reimportado. `monitor_runs.rejected` conta esses casos.
5. **Match:** critério “Território (sede da LEP)”; o proponente é sempre a organização (parceiras não contam).

## Consequências

- Regras por texto podem errar em redações incomuns: o descarte é reversível (Restaurar) e sempre traz a evidência.
- Quando houver IA (Etapa 3), a extração de território poderá ser refinada mantendo esta mesma interface.
