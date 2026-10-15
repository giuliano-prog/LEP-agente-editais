# ADR-0027 — Assistente LEP: agente de IA operacional da Área de Trabalho

- **Status:** proposto (2026-10-15) — migração versionada, aplicada **somente no TESTE/STAGING**; produção não
- **Complementa:** ADR-0006 (IA só em `packages/ai`), ADR-0015 (papéis), ADR-0026 (Área de Trabalho)
- **Substitui em parte:** ADR-0026, item "IA desligada" — a LEP decidiu (pedido de 2026-10-15) ligar a IA na
  Área de Trabalho usando o Claude (API da Anthropic).

## Contexto

A Área de Trabalho (ADR-0026) organiza a inscrição por regras determinísticas, mas a equipe ainda precisa ler o
regulamento, cruzar documentos, registrar pendências e preparar textos à mão. A LEP pediu um agente que converse,
consulte o contexto, execute ações **dentro da plataforma** e explique o que fez, deixando tudo persistido,
auditado e com evidência, sem jamais decidir sozinho o que é sensível.

## Decisão

**Cadeia:** pessoa pede → agente consulta (ferramentas de leitura) → analisa → executa ferramentas de escrita →
a Área de Trabalho é atualizada → evidência e histórico são gravados → resposta final com resumo → o que depende
de decisão humana vira proposta pendente ou decisão registrada.

- **Modelo e chamada** (`packages/ai`, único lugar com SDK de IA): `@anthropic-ai/sdk`, `claude-opus-5-5`
  (configurável por `LEP_ASSISTANT_MODEL`, lista fechada em `agent/config.ts`), thinking adaptativo, `effort`
  alto na análise completa e médio no chat, ferramentas com `strict: true`, `tool_choice: auto`, prompt de
  sistema **fixo** com cache e fallback do servidor para recusas. A transcrição de uma execução só cresce
  (requisito do "preserved thinking"); cada execução nova começa uma transcrição nova.
- **Sem fila/worker:** cada execução (`core.agent_runs`) avança **um passo por requisição** (uma chamada ao modelo +
  as ferramentas pedidas), conduzido pelo navegador. Trava curta (`lease_until`) evita passos simultâneos; a
  página tem `maxDuration = 300`. Recarregar retoma de onde parou. Erros temporários (timeout, 429, 5xx, rede)
  são tentados até 3 vezes; erros permanentes encerram como "falhou" sem perder o que foi feito. Recusa,
  saída truncada e limite de passos encerram como "parcial". Estados: aguardando, processando, concluída,
  parcial, falhou, cancelada.
- **Limites por execução:** análise completa 30 passos/120 ferramentas; chat 14/50; 16 000 tokens de saída
  por chamada; timeout 170 s.
- **20 ferramentas** (`apps/web/src/lib/assistant/tools.ts`), validadas por Zod no servidor, ligadas a UMA
  área de trabalho (o modelo nunca informa `org_id`/`workspace_id`), executadas com a sessão do usuário (RLS):
  leitura (área de trabalho, edital, documento paginado, busca no edital, produção, acervo, item, equipe,
  histórico), escrita (checklist base, requisito, item, vincular documento, achado, resolver achado, texto,
  responsável, dados da inscrição), `recalcular_prontidao` e `solicitar_confirmacao`.
- **Autonomia alta só para o que é interno, reversível e com evidência.** Regras no código, não no prompt:
  idempotência por chave estável (reexecutar não duplica); só preenche campos vazios; texto da equipe nunca é
  sobrescrito (vira sugestão — "Aplicar sugestão"); item concluído pela equipe não é reaberto; responsável só
  se não houver e só membro ativo; concluir item exige documento válido, texto dentro do limite ou justificativa.
- **Confirmação humana** (`core.agent_actions`, `kind = proposal`, `pending_confirmation`): marcar inscrição
  como enviada, arquivar, substituir texto ou documento, desvincular documento, alterar valor preenchido,
  marcar como "não se aplica" algo concluído pela equipe. Aprovada pela Diretoria/ADM, a ação é executada por
  **código determinístico** (`proposals.ts`) após revalidar o estado — nunca pelo modelo. Ações externas
  (e-mail, inscrição em sites, pagamento) **não existem** como ferramenta.
- **Evidência e confiança:** confirmado / inferido / não encontrado / precisa de confirmação humana; origem
  edital / LEP / produção / inferência da IA / equipe. "Confirmado" a partir do edital exige trecho literal
  localizado no texto paginado (documento e página vêm da posição real); sem isso vira "inferido".
  Inferência da IA nunca é "confirmada".
- **Prompt injection:** conteúdo de documentos, acervo, conversa e resultados de ferramentas entra delimitado
  como `<documento_*>` (DADO, não instrução); o prompt de sistema diz isso explicitamente; e, sobretudo, as
  regras de autonomia estão no servidor — mesmo uma instrução maliciosa obedecida só gera proposta pendente.
- **Contexto mínimo:** a execução recebe o pedido, um resumo estruturado da inscrição, o resumo do último trabalho
  e as últimas 8 mensagens (cortadas); o resto o agente consulta por ferramenta. O texto do edital é lido por
  páginas sob demanda (`core.edital_texts` guarda o texto extraído por documento, com SHA-256, para não reler PDF).
- **Persistência:** `core.assistant_conversations` (uma por área de trabalho, com resumo curto),
  `core.assistant_messages` (somente inserção), `core.agent_runs` (estado, transcrição, contadores, custo),
  `core.agent_actions` (auditoria de toda chamada de ferramenta: antes/depois, evidência, confiança, erro),
  `core.workspace_findings` (inconsistências, riscos, decisões pendentes, observações, recomendações, critérios,
  oportunidades — com deduplicação por tipo + chave) e colunas novas em `edital_workspace_items`
  (confiança, origem, documento/página/seção, `updated_via`, `ai_suggestion`).
- **Custos:** tokens (entrada, saída, cache) e custo estimado por execução em `agent_runs`; por chamada em
  `core.ai_usage`, gravado **só pelo servidor** com o cliente admin (inserção, sempre com `org_id`) — a sessão
  do usuário não consegue forjar custos. Abrir a página **nunca** chama a IA.
- **Permissões:** ADM e Diretoria (editor) acionam o agente e decidem propostas; Equipe (viewer) só lê a
  conversa e os achados; excluir achado é só do ADM. RLS com `core.has_role` em todas as tabelas, grants por
  coluna, auditoria em `core.audit_log`. Diagnóstico continua só do ADM.
- **Segredo:** `ANTHROPIC_API_KEY` só no servidor; sem ela o painel mostra "indisponível" (motivo detalhado só
  para o ADM) e nada mais muda.

## Consequências

- Dados da inscrição (trechos do edital, checklist, textos da equipe, acervo — títulos, validades e observações, não os PDFs
  da LEP) passam a ser enviados à API da Anthropic durante uma execução pedida por Diretoria/ADM. Conferir a
  política de retenção de dados da conta da Anthropic usada.
- O custo depende do tamanho do edital e do número de passos; os limites acima e o registro por execução
  permitem acompanhar. Preço usado na estimativa: tabela em `agent/config.ts` (conferir com a fatura).
- O navegador precisa ficar aberto para a execução avançar (sem worker). Se fechar, recarregar retoma.
- **Memória institucional futura:** o resumo por conversa, a auditoria de ações e os achados resolvidos com
  decisão registrada são a base para uma memória da LEP (padrões de exigência por instituição, decisões
  recorrentes). Não implementada nesta etapa: exigiria tabela própria por organização, curadoria humana e
  regra clara do que pode ser reaproveitado entre inscrições.
- Produção: a migração `20261012120000_assistente_lep.sql` só pelo workflow `supabase-migrations.yml`, com
  aprovação; a chave da Anthropic precisa ser configurada no ambiente da Vercel correspondente.
