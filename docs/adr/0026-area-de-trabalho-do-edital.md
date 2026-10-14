# ADR-0026 — Área de Trabalho do Edital (preparação da inscrição)

- **Status:** proposto (2026-10-14) — migração versionada, **ainda não aplicada em produção**
- **Complementa:** ADR-0009 (revisão humana), ADR-0011 (documentos), ADR-0013/0016 (elegibilidade),
  ADR-0020 (Match v2), ADR-0021 (retificações), ADR-0023 (IA sem fornecedor)

## Contexto

O módulo de Editais encontrava, classificava e media a aderência das oportunidades, mas a equipe preparava a
inscrição fora da plataforma. A LEP precisa organizar e cruzar, num só lugar, regras do edital, documentos da
produtora e da produção, textos, orçamento, equipe, direitos, anexos e pendências — e saber o que falta.

## Decisão

- **Uma área de trabalho por edital** (`core.edital_workspaces`): produção vinculada (`core.projetos`), situação
  (em preparação / pronta / enviada / arquivada), valores (solicitado, orçamento total, contrapartida), anotações e
  as **regras extraídas** do edital (jsonb, sempre com trecho literal).
- **Checklist persistente** (`core.edital_workspace_items`): documentos, textos (com rascunho e limites), orçamento,
  equipe, direitos, elegibilidade, anexos; status, responsável (membro **ativo** da organização), prazo interno,
  documento do acervo, observação. Itens gerados têm `source_key` estável: **regerar só acrescenta** — nunca apaga
  nem desfaz o trabalho da equipe. Itens gerados não são excluídos (viram "Não se aplica"); manuais podem ser.
- **Acervo de documentos** (`core.org_documents`): documentos da LEP (produtora) e das produções, com validade;
  PDF no bucket privado existente `edital-documents` em `<org_id>/acervo/<uuid>.pdf` (mesmas políticas de Storage)
  ou link externo. O servidor confere caminho, tamanho, assinatura `%PDF` e calcula SHA-256.
- **Motor determinístico** em `@lep/funding` (`workspace/`), sem IA:
  - `extractWorkspaceRules(texto)`: textos exigidos e limites (caracteres, palavras, páginas/laudas), critérios de
    avaliação com pontuação, pontuação adicional, direitos/cessões, equipe, orçamento (contrapartida mínima %,
    teto de despesas administrativas %), documentos (reaproveita `extractHighlights`).
  - `buildChecklistSeeds`: checklist a partir do cadastro + regras, sem duplicar cláusulas entre categorias.
  - `assessWorkspace`: cruza edital × checklist × produção (Match v2) × acervo (validade × prazo) × orçamento
    (teto, faixa, solicitado × total, contrapartida) × retificações pendentes; gera impedimentos, correções,
    pontos de atenção, pendências, **prontidão** (% de obrigatórios concluídos; bloqueada se houver impedimento),
    **próximas ações** priorizadas e respostas às perguntas operacionais da equipe.
- **Texto do edital**: lido na hora dos documentos guardados (regulamento, retificações, anexos — PDF/HTML) com a
  sessão do usuário; sem documento legível, usa o cadastro. O texto **não é gravado** — só as regras com trechos.
- **Permissões**: Equipe (viewer) consulta; **Diretoria (editor) e ADM trabalham**; excluir a área de trabalho
  inteira é só do ADM. RLS com `core.has_role` + `core.workspace_item_refs_ok` (área de trabalho, responsável ativo
  e documento do acervo na mesma organização). Grants por coluna; auditoria em `core.audit_log`.
- **IA (ponto de integração preparado, desligado)**: `@lep/ai` → `WorkspaceReviewer` com `NoopWorkspaceReviewer`
  (`enabled = false`) e `validateWorkspaceReview` (sugestão sem trecho do edital é descartada; nenhuma afirmação de
  aprovação). **Sem adaptador de fornecedor**: diferente do `EditalAnalyzer`, aqui entrariam textos da LEP
  (sigilosos) — ligar exige decisão explícita da LEP.

## Consequências

- Regras da LEP preservadas: nunca afirmar aprovação (`MATCH_DISCLAIMER`); restrição territorial é impedimento
  **a confirmar pela equipe** (nada decidido automaticamente); a proponente é sempre a LEP.
- Páginas de texto são **estimadas** (≈ 500 palavras/página); limites de caracteres contam espaços.
- A extração por regras pode não encontrar tudo: a equipe adiciona itens manuais; o trecho do edital acompanha
  cada item gerado para conferência.
- Produção: a migração `20261011120000_area_trabalho_edital.sql` só deve ser aplicada pelo workflow
  `supabase-migrations.yml`, com aprovação. Sem ela, a página mostra o erro do banco com causa e correção.
- Futuro: equipe da produção (quando a Equipe Audiovisual tiver tabela), orçamento por rubrica, revisão por IA.
