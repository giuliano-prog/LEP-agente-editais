# Status da Plataforma LEP — estado atual oficial

> **Atualizado em:** 2026-09-28 · **Branch:** `claude/epic-cerf-abwkc1` · **Commit de referência:** `fc3b550`
>
> Documento de referência para qualquer assistente ou pessoa entender o projeto sem ler o histórico da conversa.
> Legenda: **✅ IMPLEMENTADO** (no código, testado) · **🟡 EM ANDAMENTO** (decidido/parcial, aguardando algo) ·
> **⬜ PLANEJADO** (definido, não iniciado). Itens marcados **(informado pela equipe)** foram relatados pela LEP e
> **não foram verificados** a partir deste repositório (o assistente não tem acesso ao Supabase/Vercel de produção).

---

## 1. Visão geral da plataforma

**Objetivo.** Plataforma própria da LEP Filmes (produtora audiovisual sediada em São Paulo/SP) para inteligência e
automação da operação. O primeiro módulo é **Captação de Recursos / Editais**: encontrar oportunidades de
financiamento, confirmar na fonte oficial, estruturar, interpretar e cruzar com os projetos da LEP, de forma
explicável e **sem nunca afirmar que um projeto será aprovado**.

**Arquitetura geral** (ADR-0001/0002): monólito modular em monorepo pnpm.

```
apps/web (Next.js 16, Vercel) ──► Supabase (PostgreSQL + Auth + Storage, RLS em tudo)
   │  proxy.ts (sessão) · páginas por módulo · Server Actions · /api/cron/monitor
   ▼
packages/core      papéis e permissões          packages/db         tipos do banco
packages/ai        ponto único de IA (contrato) packages/ingestion  download seguro, HTML, robots.txt, hash
packages/modules/  funding (editais, Match, varredura, território) · projects (vocabulário/validação)
```

**Núcleo compartilhado (schema `core`)** — ✅ IMPLEMENTADO: organizações (com sede do proponente), perfis,
vínculos/papéis, auditoria (`audit_log`), registro de custos de IA (`ai_usage`), armazenamento privado de documentos.

**Módulos existentes**

| Módulo                                      | Estado                                           |
| ------------------------------------------- | ------------------------------------------------ |
| Captação de Recursos / Editais              | ✅ em uso (evolução em andamento — ver §3 e §11) |
| Projetos (cadastro básico usado pelo Match) | ✅ versão inicial                                |
| Membros (listagem + sede do proponente)     | ✅ versão inicial (convite pela tela ⬜)         |
| Diagnóstico de configuração                 | ✅                                               |

**Módulos planejados** (⬜, apenas nomeados; escopo e ordem ainda não definidos): Contratos, Equipe, Orçamentos,
Prestação de contas, Direitos e clearance, Produção, Documentação, Assistente da LEP.

---

## 2. Estado atual

**✅ Implementado e funcionando (testado neste repositório)**

- Fundação: login por convite, papéis, RLS, auditoria, identidade visual (tema escuro LEP; logo oficial em alta
  resolução no cabeçalho e no login, proporção preservada em desktop e celular).
- Editais: listagem (Oportunidade | Instituição | Prazo | Valor | Aderência), detalhe, cadastro por link/PDF/manual,
  cópia original guardada com SHA-256, revisão humana, triagem (descartar/restaurar).
- Projetos: cadastro e listagem.
- Match edital × projeto explicável (✓ / ⚠ / ✕) e Aderência (Alta/Média/Baixa/Sem projetos).
- Varredura automática diária de fontes + "Verificar agora" + histórico de varreduras. Antes de rodar, compara as
  fontes ativas vistas pela interface e pelo motor e identifica o tipo da chave de serviço (erro claro se divergir);
  resumo por fonte e total (encontradas, novas, atualizadas, duplicadas, descartadas, pendentes, erros).
- Diretrizes LEP no código: território (sede São Paulo/SP) e foco exclusivo na LEP como proponente.
- Página Diagnóstico e script SQL de diagnóstico (somente leitura).
- Migrações idempotentes + workflow de aplicação automática em produção via `supabase db push --db-url`.

**✅ Em produção (informado pela equipe)**: app publicado na Vercel; banco remoto sincronizado pelo workflow de
migrações; varredura real executada (resultado relatado: 10 em acompanhamento, 6 novas da varredura, 5 descartadas;
fontes Spcine, RioFilme, ANCINE/FSA).

**🟡 Em andamento**

- Evolução do motor de monitoramento e do módulo Membros: **diagnóstico técnico entregue, aguardando decisões**
  (ver §10–11). Nenhuma implementação iniciada.

**⬜ Planejado**: extração/interpretação por IA (aguarda escolha do fornecedor), alertas por e-mail, detecção de
retificações, deduplicação multi-fonte, novas fontes, Diários Oficiais, perfis Administrador/Diretoria/Equipe, convite
de membros pela tela, módulos futuros.

---

## 3. Módulo Captação de Recursos / Editais

### Funcionalidades atuais (✅)

- **Listagem** `/editais`: colunas Oportunidade · Instituição · Prazo · Valor · Aderência (Match); filtros
  "Em acompanhamento", "Novos da varredura", "Revisão pendente", "Descartados"; ordenação no app (abertos por prazo →
  sem prazo → encerrados). Leitura com `select("*")` e normalização defensiva (`toEdital`), tolerante a colunas
  extras/ausentes.
- **Detalhe** `/editais/[id]`: resumo, critérios, documentos exigidos, categorias, regras usadas no Match (inclui
  território), links oficiais, documentos guardados, PDFs encontrados na página, painel de Match, Editar, Descartar/Restaurar.
- **Fontes** `/editais/fontes`: cadastro (admin), sugestões, pausar/remover, "Verificar agora", histórico.

### Cadastro (✅, ADR-0011)

- **Por link**: download seguro (anti-SSRF, portas 80/443, redirecionamentos revalidados, 20 s, 25 MB) → cópia no
  bucket privado → título sugerido e PDFs da página.
- **Por PDF**: navegador envia direto ao Storage; servidor valida caminho, tamanho e assinatura `%PDF`.
- **Manual**: só o título. Criação atômica edital + documento (`core.create_edital_with_document`).
- Todos nascem com `review_status = 'pending'` e abrem o formulário de revisão.

### Revisão (✅, ADR-0009)

Formulário completo (valores em R$, prazo em horário de Brasília — sem hora = 23h59, listas por linha, regras do
Match, território). Só vira `validated` com a confirmação explícita "Revisei estas informações com o documento oficial".

### Elegibilidade (✅, etapa 5)

Terceiro eixo próprio (`eligibility_status`, ADR-0016, `packages/modules/funding/src/eligibility.ts`): elegível ·
não elegível (só decisão humana, com motivo) · não confirmada · restrição territorial · via parceiro · pessoa física ·
necessita revisão. Regras determinísticas com motivo e trecho (evidência); decisão manual da equipe prevalece e não é
sobrescrita. Aba **Elegibilidade** no detalhe (motivo, trecho, territórios, formulário da equipe) e filtro na lista.
Parcerias: espaço reservado (`organizations.partner_territories`, sem tela) — só geram "via parceiro".

### Aderência (✅)

`summarizeAdherence`: melhor resultado de Match entre os projetos → Alta (compatível), Média (compatível com
pendências), Baixa (algum critério não atendido), Sem projetos. Mostra o melhor projeto e "n/m compatíveis".
Calculada na hora (não gravada). Considera a sede do proponente.

### Match com projetos (✅, regras determinísticas, sem IA)

Critérios: revisão do edital · prazo/status · **território (sede da LEP)** · formato · gênero/tipologia · estágio ·
faixa de orçamento · critérios textuais e documentos exigidos (sempre "⚠ verificar"). Resultado: atendidos / pontos de
atenção / não atendidos + aviso fixo `MATCH_DISCLAIMER` (não é previsão de aprovação).

### Deduplicação (✅ básica)

- Cadastro: mesmo SHA-256 de documento **ou** mesmo link oficial na organização → recusado com link para o existente.
- Varredura: ignora links já conhecidos (URL normalizada de editais e documentos) e documentos com mesmo hash.
- ⬜ Planejado: chave canônica (órgão + número + ano), título normalizado, período, avistamentos multi-fonte.

### Benchmark (🟡 estrutura pronta; casos reais pendentes)

- `pnpm benchmark:editais` compara o motor atual com casos conferidos por uma pessoa: por campo (é oportunidade,
  território, elegibilidade, prazo, valor, situação) mostra acertos, erros, **erros graves** (descartar o que não era
  inelegível) e campos **sem avaliador** (nunca contam como acerto). Opções `--json` e `--min-accuracy`.
- Fora do código de produção (`packages/modules/funding/benchmark/`). Exemplos versionados são **fictícios**; casos
  reais ficam em `benchmark/private/` (ignorada pelo Git) ou `--cases`.
- Resultado com os 6 exemplos fictícios: território, prazo, valor e situação 100%; "é oportunidade" 80% (página
  genérica aceita — problema conhecido, etapa 6); elegibilidade sem avaliador (etapa 5).
- **Dependência externa:** a planilha das 38 oportunidades (26/09/2026) não está no repositório.

### Fluxo de monitoramento (✅, ADR-0012)

```
Vercel Cron diário 10:00 UTC (7h Brasília) → GET /api/cron/monitor (Bearer CRON_SECRET)
  ou "Verificar agora" (admin)
→ runMonitor (cliente com chave de serviço): fontes active = true
→ por fonte: robots.txt → página de listagem → extractLinks → selectCandidates
   (termos de edital + audiovisual; exclui ruído e links conhecidos; até 5 importações/fonte, 50 s no total)
→ por candidato: baixa página → guarda cópia → cria edital (origin = monitor, revisão pendente)
   → prazo/valor/status/resumo sugeridos por regras de texto
   → assessEligibility: elegibilidade (eligibility_status + motivo + trecho); restrição fica visível, triagem pendente
→ grava core.monitor_runs (links, candidatos, encontradas, novas, duplicadas, com restrição, pendentes,
   bloqueadas pelo robots.txt, falhas, erro, execution_id) e status da fonte
→ "Verificar agora": antes de rodar, checkMonitorAccess compara fontes ativas (sessão × chave de serviço);
   depois, mostra o resumo por fonte e o total
```

### Fontes monitoradas (✅)

Sugestões no código: **RioFilme** (`/editais/`), **Spcine** (`/editais/`), **ANCINE/FSA**. Cadastro por página de
listagem com opções "fonte exclusiva de audiovisual" e filtro de endereço.

### Extração ampliada, evidência por campo e texto de PDF (✅, etapa 7, ADR-0018)

- **Texto de PDF em TypeScript** com `pdfjs-dist` (Mozilla, 6.3.289), **sem OCR**: camada de texto, até 60 páginas,
  limite de tempo; sem XFA/WebAssembly/fontes do sistema. PDF digitalizado, protegido ou longo gera aviso.
- `extractFields` (`packages/modules/funding/src/extract.ts`): prazo final, abertura das inscrições, valor total,
  valor máximo por projeto, quantidade de projetos, formatos, gêneros, estágios — cada um com **trecho e origem**
  (página ou PDF). Regulamento (PDF) prevalece; divergências viram aviso. Na dúvida, campo vazio.
- Varredura: lê a página, segue o **link do regulamento em PDF** (`pickRegulationLink`, ignora resultado/errata/
  formulários), guarda o PDF como anexo e grava sugestões + `field_evidence` + `extraction_notes`. Situação "em breve"
  quando as inscrições ainda não abriram.
- Cadastro manual por link/PDF: mesma extração e elegibilidade automática, tudo pendente de revisão.
- Aba **Dados e evidências**: valor, trecho e origem de cada campo; avisos da extração.
- Validado: testes unitários, integração da varredura com PDF gerado, e envio de PDF no build de produção (Next.js)
  com Supabase simulado. **Não validado com PDFs reais de editais** (rede do ambiente bloqueia sites externos).

### Classificador de páginas e configuração por fonte (✅, etapa 6, ADR-0017)

- `classifyPage` (`packages/modules/funding/src/page-classifier.ts`): oportunidade · incerta · lista de editais ·
  resultado · retificação · notícia · institucional, com os sinais que justificam. Na dúvida, **incerta** (entra
  para revisão). Tipo de oportunidade: edital, chamada, prêmio, concurso, credenciamento, seleção, programa,
  festival, laboratório.
- A varredura classifica **antes de guardar**: só oportunidade/incerta vira edital (tipo e sinais na aba Dados); as
  demais vão para `core.monitor_ignored_urls` com o motivo, aparecem em Fontes → "Páginas ignoradas" e não são
  baixadas de novo até um admin clicar em **Reavaliar**. Contador "Ignoradas" no resumo e no histórico.
- Configuração por fonte (`edital_sources.adapter_config`, tela "Configurar fonte"): ignorar endereços/títulos,
  máximo de novas por verificação (1–10), classificar páginas, aceitar PDFs. **Sem seletores CSS**; configuração
  inválida no banco não para a varredura (usa o padrão e mostra o aviso).

### Regras territoriais (✅, ADR-0013, `docs/diretrizes-lep.md`)

Aceita nacionais, estado de SP, município de São Paulo e locais abertos a SP; nacional com cota regional = aceito com
aviso para revisar; sem informação = não confirmada (nunca "não elegível" sem decisão humana); exclusivo de outro
território = **restrição territorial visível** (motivo + trecho, triagem pendente) — desde a etapa 5 não há descarte
automático. Descartes automáticos antigos foram convertidos pela migração `20261002120000`. Sem exceção fixa por
instituição (ex.: RioFilme). Parceiras/coprodutoras não contam (LEP é sempre a proponente).

### Status utilizados (✅)

| Campo                     | Valores                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `status` (situação)       | `open` · `upcoming` · `closed` · `suspended` · `under_review` · `result_published` (aliases em PT normalizados)           |
| `review_status` (triagem) | `pending` · `validated` · `discarded` (só decisão da equipe)                                                              |
| `eligibility_status`      | `eligible` · `not_eligible` · `not_confirmed` · `territorial_restriction` · `via_partner` · `individual` · `needs_review` |
| `origin`                  | `manual` · `monitor`                                                                                                      |
| `eligible_territories`    | `BR` · UF (ex.: `SP`) · `UF:Município`                                                                                    |

---

## 4. Última alteração implementada

**Commit `a4a8e82` — "Workflow de migrações: db push --db-url, sem supabase link"** (última tarefa de código
executada pelo assistente). Tarefas posteriores (resumo de arquitetura e diagnóstico técnico) **não alteraram código**.
Commits seguintes no branch (`87b4f83`, `fc3b550`) são uploads feitos pela equipe (pasta `brand/` e `lep-logo.png`).

| Aspecto                         | Alteração                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Funcionalidade                  | Job de produção do workflow deixou de usar `supabase link` (Management API); aplica migrações direto no PostgreSQL com `supabase db push --db-url`                                                                                                                                                                                               |
| Workflow                        | `.github/workflows/supabase-migrations.yml`: validação do segredo (recusa porta 6543 e URL sem senha), máscara da senha nos logs, `--dry-run` antes, `--include-all --yes` na aplicação, `migration list` ao final; CLI fixado em `2.118.0`; mantidos teste em banco descartável, concorrência sem cancelamento, ambiente `production`, sem seed |
| Secrets                         | Passa a usar só `SUPABASE_DB_URL` (Session pooler, porta 5432); `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` deixaram de ser usados                                                                                                                                                                                   |
| Banco / migrations / permissões | Nenhuma alteração                                                                                                                                                                                                                                                                                                                                |
| Componentes / rotas / serviços  | Nenhuma alteração                                                                                                                                                                                                                                                                                                                                |
| Testes                          | Validado localmente: dry-run, aplicação, histórico, reaplicação ("up to date") e ausência da senha na saída, contra PostgreSQL descartável; script de validação testado com 4 casos                                                                                                                                                              |
| Arquivos                        | `.github/workflows/supabase-migrations.yml`, `README.md`, `docs/adr/0014-migracoes-automaticas.md`                                                                                                                                                                                                                                               |

---

## 5. Membros, autenticação e permissões

- **Login (✅):** Supabase Auth com e-mail e senha; **cadastro público desligado**; sessão em cookies renovada por
  `src/proxy.ts`; convite/recuperação por link com `token_hash` → `/auth/confirm` → `/conta/senha`.
- **Organização e vínculo (✅):** `core.organizations` (tenant; hoje só LEP, com `hq_state/hq_city`), `core.profiles`
  (criado por trigger no cadastro do Auth), `core.memberships` (usuário ↔ organização ↔ papel ↔ **status**).
- **Perfis (✅, ADR-0015):** Administrador = `admin`, Diretoria = `editor`, Equipe = `viewer` (só rótulos; enum
  `core.app_role` = `packages/core/src/auth/roles.ts` inalterado).
- **Status do vínculo (✅, migração `20261001120000`):** `invited` (Convidado) · `active` (Ativo) · `suspended`
  (Suspenso). Só vínculos ativos acessam (`role_in_org` → `has_role` → RLS). Regras no banco: vínculo criado pela
  interface nasce convidado; só a própria pessoa aceita o convite ao entrar; ninguém suspende o próprio acesso;
  convite nunca aceito volta a ser convite ao reativar; sempre há ao menos um administrador **ativo**. Vínculos
  anteriores continuam ativos. Suspensos veem a tela "Acesso suspenso".
- **Permissões atuais (✅)** (`packages/core/src/auth/permissions.ts`; a garantia real é o RLS):
  `content.read` viewer · `content.edit` editor · `content.review` editor · `org.manage` admin ·
  `members.manage` admin · `ai_usage.read` admin · `audit.read` admin. Diagnóstico, Membros e cadastro de fontes exigem admin.
- **Tela Membros (✅):** sede do proponente; convite (e-mail, nome, perfil); lista com perfil, status e data;
  ações Reenviar convite, Suspender, Reativar. Validada com Supabase simulado (convite e reenvio de ponta a ponta,
  desktop e celular).
- **Convite (✅ código / ⚠ produção não verificada):** ação no servidor exige admin e só então usa a chave de serviço
  (`inviteUserByEmail`) e grava o vínculo "convidado" no `org_id` do admin (`lib/members/invite.ts`). A pessoa define
  a própria senha no link (`/auth/confirm` → `/conta/senha`); a plataforma nunca pede nem guarda senhas. Quem já tem
  conta recebe só o vínculo (acesso no próximo login). Script `pnpm members:invite` mantido para o primeiro admin.
- **Configuração manual necessária em produção (não feita, não verificável daqui):** Supabase → Authentication →
  Emails: **SMTP próprio** (o envio padrão do Supabase tem limite baixo e só entrega para a equipe do projeto) e
  modelo **"Invite user"** igual a `supabase/templates/invite.html`; URL Configuration: **Site URL** e **Redirect
  URLs** com o domínio da Vercel. Opcional: `SITE_URL` na Vercel. Depois disso, convidar a primeira pessoa pela tela
  (perfil Diretoria) — nenhum usuário é criado pelo código.

---

## 6. Banco e infraestrutura

- **Supabase:** PostgreSQL 17 (local via CLI), Auth, Storage. Schema exposto na API: `core`.
- **Tabelas principais (`core`):** `organizations`, `profiles`, `memberships`, `audit_log`, `ai_usage`, `editais`,
  `projetos`, `edital_documents`, `edital_sources`, `monitor_runs`. Funções: `has_role`, `role_in_org`, `try_uuid`,
  `create_edital_with_document`, triggers de auditoria/updated_at/perfil/último admin.
- **Storage:** bucket privado `edital-documents` (PDF/HTML, 25 MB), caminho `<org_id>/...`.
- **Migrations** (`supabase/migrations/`, todas idempotentes — ADR-0014):
  `20260925120000_core_foundation` · `20260926120000_editais_projetos` · `20260927120000_edital_documents` ·
  `20260928120000_monitoramento` · `20260929120000_diretrizes_territorio` · `20260930120000_monitor_resumo` · `20261001120000_membros_status` ·
  `20261002120000_elegibilidade` · `20261003120000_classificador_paginas` ·
  `20261004120000_evidencias`
  (branch `claude/melhorias-editais`, ainda não aplicadas em produção: entra pelo workflow quando o branch for
  integrado ao de produção).
- **Workflow de produção:** `.github/workflows/supabase-migrations.yml` — push no branch de produção
  (`SUPABASE_MIGRATIONS_BRANCH`, padrão `main`) que altere migrações, ou manual → testes em banco descartável →
  `supabase db push --db-url` (dry-run antes). **CI** (`ci.yml`): formatação, lint, tipos, testes, build, migrações 2x
  e cenário de banco parcial.
- **Vercel:** app `apps/web` (Root Directory `apps/web`); cron em `apps/web/vercel.json`.
- **Cron:** `/api/cron/monitor`, diário às 10:00 UTC.
- **Variáveis de ambiente (nomes apenas):**
  | Onde                                   | Nome                                                               | Uso                                                        |
  | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
  | Vercel/local                           | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente (precisam existir no build)                        |
  | Vercel/local (servidor)                | `SUPABASE_SECRET_KEY`                                              | varredura, cron, diagnóstico, sede do proponente, convites |
  | Vercel                                 | `CRON_SECRET`                                                      | autenticação do cron                                       |
  | Local (script) / Vercel (opcional)     | `SITE_URL`                                                         | links de convite (script e tela Membros)                   |
  | GitHub (secret, ambiente `production`) | `SUPABASE_DB_URL`                                                  | aplicação das migrações                                    |
  | GitHub (variable)                      | `SUPABASE_MIGRATIONS_BRANCH`                                       | branch de produção das migrações                           |

---

## 7. Segurança

- **RLS em todas as tabelas** com `core.has_role(org_id, papel)`; grants explícitos por coluna; `anon` sem acesso ao
  schema `core`; Storage protegido pela pasta da organização.
- **Controle de acesso em 3 camadas:** `proxy.ts` (login) → `requireMembership(papel)` nas páginas/ações → RLS no banco.
- **Auditoria:** trigger genérico em organizações, vínculos, editais, projetos, documentos e fontes.
- **Secrets:** nunca no código; `.env*` fora do Git; chave de serviço só no servidor e de uso restrito (varredura,
  cron, diagnóstico); segredo do cron comparado em tempo constante; senha do banco mascarada no workflow.
- **Revisão humana:** nenhum edital é validado sem confirmação explícita; importados pela varredura entram pendentes.
- **Coleta responsável:** anti-SSRF, `robots.txt`, sem login em sites de terceiros, HTML capturado nunca exibido
  (só baixado).
- **Isolamento de módulos:** um schema/pacote por domínio; módulos não acessam tabelas internas de outros; IA só via
  `packages/ai` (contrato `AiProvider` + registro de custo).

---

## 8. Testes (executados em 2026-09-28 neste repositório)

| Verificação                                              | Resultado                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatação (Prettier), lint (ESLint), tipos (TypeScript) | ✅ sem erros                                                                                                                                                                                                                                                                                                                                                                           |
| Testes unitários/integração (Vitest)                     | ✅ **238** passando — core 8, ai 2, projects 3, ingestion 53 (inclui texto de PDF), funding 114 (inclui benchmark, elegibilidade, classificador e extração), web 58 (inclui integração da varredura com site e Supabase simulados e `checkMonitorAccess` com chave correta, divergente, publishable, anon, ausente e com erro; convites/reenvio de membros com Supabase Auth simulado) |
| Testes SQL de RLS (PostgreSQL 16 + simulação Supabase)   | ✅ **163** verificações em 10 arquivos (inclui status do vínculo: convite, aceite, suspensão, reativação, último admin ativo; elegibilidade e conversão dos descartes automáticos; classificador e configuração por fonte; evidências), com migrações aplicadas 2x                                                                                                                     |
| Cenário "remoto parcialmente migrado à mão"              | ✅ alinhado                                                                                                                                                                                                                                                                                                                                                                            |
| Build de produção (Next.js 16)                           | ✅ 16 rotas                                                                                                                                                                                                                                                                                                                                                                            |

**Problemas conhecidos**

1. 🟡 Páginas genéricas: o classificador (etapa 6) deixa de fora resultados, retificações, notícias, páginas
   institucionais (ex.: "Programa de Integridade") e índices (ex.: "Chamamento Público"), com o motivo. Validado com
   páginas fictícias e o benchmark; **não validado em sites reais** (a rede deste ambiente bloqueia sites externos).
2. PDFs digitalizados (imagem) não são lidos: não há OCR (decisão da etapa 7); a interface avisa para conferir.
3. Não há detecção de alterações/retificações (etapa 10).
4. Limites: até 5 importações por fonte e 50 s por execução; cron diário.
5. Não verificado a partir daqui: execução do CI no GitHub, configuração de e-mail/SMTP e modelos no Supabase de produção.

---

## 9. Documentação e arquivos importantes

| Arquivo                                                     | Função                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `README.md`                                                 | Como rodar, comandos, produção, solução de problemas                 |
| `CLAUDE.md`                                                 | Regras obrigatórias para agentes (diretrizes LEP e convenções)       |
| `docs/STATUS-PLATAFORMA-LEP.md`                             | Este documento (estado atual oficial)                                |
| `docs/arquitetura.md`                                       | Estrutura de pastas e checklist para novos módulos                   |
| `docs/diretrizes-lep.md`                                    | Regras de negócio da LEP (território, foco na LEP, tabela/Match)     |
| `docs/adr/0001…0014`                                        | Decisões de arquitetura (índice em `docs/adr/README.md`)             |
| `supabase/migrations/*`                                     | Estrutura do banco (idempotente)                                     |
| `supabase/tests/*`                                          | Testes SQL de permissão; `scenarios/` = banco parcial                |
| `supabase/scripts/diagnostico.sql`                          | Diagnóstico somente leitura para o SQL Editor                        |
| `supabase/config.toml`, `supabase/templates/*`              | Supabase local e e-mails de convite/recuperação                      |
| `.github/workflows/ci.yml`                                  | CI (qualidade, testes, build, migrações)                             |
| `.github/workflows/supabase-migrations.yml`                 | Aplicação automática de migrações em produção                        |
| `apps/web/vercel.json`                                      | Agendamento do cron                                                  |
| `apps/web/src/lib/monitor/run.ts`                           | Motor da varredura                                                   |
| `apps/web/src/lib/editais/ingest.ts`                        | Ingestão (download/upload, cópia, duplicidade)                       |
| `apps/web/src/lib/diagnostics.ts`, `lib/supabase/errors.ts` | Diagnóstico e tradução de erros do banco                             |
| `apps/web/src/lib/supabase/{server,client,admin,proxy}.ts`  | Clientes Supabase (sessão, navegador, serviço)                       |
| `packages/modules/funding/src/*`                            | Edital, Match, aderência, varredura (regras), território, formulário |
| `packages/modules/projects/src/*`                           | Vocabulário e validação de projetos                                  |
| `packages/ingestion/src/*`                                  | Download seguro, robots.txt, leitura de HTML, hash                   |
| `packages/core/src/auth/*`                                  | Papéis e permissões                                                  |
| `packages/ai/src/*`                                         | Contrato de IA e registro de custos (sem fornecedor)                 |
| `apps/web/scripts/invite-member.ts`                         | Convite de membros por linha de comando                              |
| `apps/web/public/brand/lep-logo.png`                        | Logo oficial em uso (alta resolução, `lib/brand.ts`)                 |
| `apps/web/public/logo.jpg`                                  | Logo antigo — sem uso, mantido só para reversão                      |

---

## 10. Pendências

1. Configurar em produção: SMTP próprio, modelo de e-mail de convite e URLs de redirecionamento do Supabase Auth.
2. Motor: classificação do tipo de página/oportunidade; elegibilidade separada da aderência; extração ampliada com
   evidência por campo; leitura de texto de PDF; deduplicação multi-fonte; aderência explicável por fatores (gravada).
3. Detecção de alterações/retificações a partir dos documentos e hashes guardados.
4. Novas fontes via adaptadores (Cultura SP/SCEIC, MinC, BRDE/FSA, Prosas, patrocinadores).
5. Extração/interpretação por IA (depende da escolha do fornecedor).
6. Alertas por e-mail.

**Decididas (2026-09-28):** classificação visível de restrição territorial (etapa 5); Diretoria = `editor`, Equipe =
`viewer`; ordem das etapas 1–12 do plano de melhorias.

**Decisões pendentes da LEP:** (a) provedor de SMTP e remetente; (b) envio da planilha do benchmark de 26/09/2026
(38 oportunidades); (c) remoção do `logo.jpg` antigo; (d) fornecedor de IA; (e) se a Equipe precisará editar algo no
futuro (hoje só lê).

---

## 11. Próximos passos técnicos (ordem lógica)

1. ✅ Coerência de fontes ativas + validação real da chave de serviço + resumo detalhado por execução
   (branch `claude/melhorias-editais`, etapa 2).
2. ✅ Membros: status do vínculo, convite pela tela, rótulos Administrador/Diretoria/Equipe, suspender/reativar
   (etapa 3). Falta só a configuração manual de SMTP/modelo em produção e o convite da primeira pessoa pela tela.
3. 🟡 Benchmark: ✅ estrutura, formato, avaliadores do motor atual, relatório (`pnpm benchmark:editais`) e testes
   (etapa 4); ⬜ casos reais — **dependem da planilha das 38 oportunidades, que não está no repositório**.
4. ✅ Taxonomia em três eixos (situação · triagem · elegibilidade) + elegibilidade separada + filtros + abas (etapa 5).
5. ✅ Classificador de página/tipo de oportunidade + configuração de adaptadores por fonte (etapa 6).
6. ✅ Extração ampliada + evidência por campo + texto de PDF (etapa 7).
7. Deduplicação multi-fonte (chave canônica + avistamentos).
8. Aderência por fatores e Match v2 gravados.
9. Detecção de alterações/retificações com revisão.
10. Novas fontes.
11. IA atrás de uma interface única de análise (`EditalAnalyzer`) usando `packages/ai`.

---

## 12. Estado do Git

| Item                                        | Valor                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| Repositório                                 | `giuliano-prog/LEP-agente-editais`                    |
| Branch atual                                | `claude/epic-cerf-abwkc1` (único branch no remoto)    |
| Commit mais recente (antes deste documento) | `fc3b550` — "Add files via upload" (logo em `brand/`) |
| Última alteração de código                  | `a4a8e82` — workflow de migrações com `--db-url`      |
| Alterações não commitadas                   | Nenhuma (antes da criação deste arquivo)              |
