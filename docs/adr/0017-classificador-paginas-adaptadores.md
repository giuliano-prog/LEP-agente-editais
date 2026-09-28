# ADR-0017 — Classificador de páginas e configuração por fonte

**Status:** Aceita (2026-09-28)

## Contexto

A varredura transformava em edital qualquer link com termos de edital, inclusive páginas institucionais
("Programa de Integridade"), índices ("Chamamento Público"), resultados e notícias. Cada fonte também precisava de
ajustes próprios sem mexer no código.

## Decisão

- **Classificador determinístico** (`classifyPage`, sem IA): tipos `opportunity`, `uncertain`, `listing`, `result`,
  `rectification`, `news`, `institutional`, sempre com os sinais/motivos. Conservador: na dúvida, `uncertain`, que
  entra para revisão humana. Só tipos claramente não-oportunidade ficam de fora.
- A varredura baixa a página, classifica e **só então** guarda a cópia (páginas ignoradas não ocupam o Storage).
- Páginas ignoradas ficam em `core.monitor_ignored_urls` (motivo visível; RLS: equipe lê, admin apaga para
  reavaliar; só o servidor grava). Não são baixadas de novo.
- **Adaptador por fonte** em `edital_sources.adapter_config` (JSON validado por `sourceAdapterSchema`): exclusões por
  trecho de endereço/título, limite de importações, classificar páginas, aceitar PDFs. **Não há seletores CSS/XPath**
  (frágeis e não testáveis sem os sites). Configuração inválida → padrão + aviso, nunca falha a varredura.
- O benchmark ganhou o campo `pageType` e o `isOpportunity` passa a considerar o classificador.

## Consequências

- Fontes novas (etapa 11) entram por configuração, sem código por instituição.
- Regras novas de classificação devem vir com casos no benchmark e testes.
