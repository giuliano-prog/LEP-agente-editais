# ADR-0022 — Novas fontes por configuração e teste antes de ativar

**Status:** Aceita (2026-09-28)

## Contexto

A LEP quer monitorar Cultura SP (SCEIC), MinC, BRDE/FSA, Prosas e programas de patrocínio. Os sites não puderam ser
acessados a partir do ambiente de desenvolvimento, e seletores CSS escritos sem o site real seriam frágeis.

## Decisão

- Catálogo de fontes em código só com **configuração do adaptador** (ADR-0017): exclusões por endereço/título,
  limite de importações, classificação de páginas. **Sem seletores CSS/XPath e sem endereço pré-preenchido.**
- O administrador cola a página oficial, **testa** (`previewSource`: mesmo caminho da varredura, sem gravar) e
  adiciona. Fontes do catálogo entram **pausadas**; ativar é decisão explícita depois do teste.
- "Testar fonte" também existe para qualquer fonte cadastrada.

## Consequências

- A validação no site real acontece em produção, pelo administrador. Ajustes viram configuração ("Configurar
  fonte"), não código.
- Sites que exigem login ou montam a lista por JavaScript aparecem no teste com aviso (a varredura lê só o HTML).
