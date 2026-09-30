# Status da Plataforma LEP — estado atual oficial

> **Atualizado em:** 2026-09-30 (fechamento da V1 para apresentação, §17); 2026-09-30 (criação direta de membros, Minha conta e foto de perfil, §16; fechamento da versão atual: navegação, Home, Buscar Editais, Membros e plantas, §15); 2026-09-29 (estratégia e limites de custo da descoberta web, §14.2; 1º teste real preparado, §14.1; descoberta web e favoritas, §14; auditoria pré-merge §4.1; staging §13) · **Branch:** `claude/melhorias-editais` (etapas 1–12
> do plano de melhorias) · **Commit de referência:** descoberta web `81af51e` (+ commit de documentação; auditoria em `83f8444`) · **Produção:** ainda na versão
> anterior às etapas (branch não integrado; `claude/epic-cerf-abwkc1` em `d6b5af1`, não alterado)
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
packages/core      papéis, permissões, status do vínculo    packages/db   tipos do banco
packages/ai        contrato de IA + EditalAnalyzer (sem fornecedor)
packages/ingestion download seguro (anti-SSRF), HTML, robots.txt, hash, texto de PDF (pdfjs-dist, sem OCR)
packages/modules/  funding (edital, elegibilidade, classificador, extração, deduplicação, Match v2, alterações,
                   adaptador de fonte, benchmark) · projects (vocabulário/validação)
```

**Núcleo compartilhado (schema `core`)** — ✅ IMPLEMENTADO: organizações (com sede do proponente), perfis,
vínculos/papéis, auditoria (`audit_log`), registro de custos de IA (`ai_usage`), armazenamento privado de documentos.

**Módulos existentes**

| Módulo                                      | Estado                                              |
| ------------------------------------------- | --------------------------------------------------- |
| Captação de Recursos / Editais              | ✅ em uso; etapas 1–12 implementadas no branch (§2) |
| Projetos (cadastro básico usado pelo Match) | ✅ versão inicial                                   |
| Membros (perfis, status, convite pela tela) | ✅ no branch (e-mail em produção a configurar)      |
| Diagnóstico de configuração                 | ✅ (verifica também as migrações das etapas)        |

**Módulos planejados** (⬜, apenas nomeados; escopo e ordem ainda não definidos): Contratos, Equipe, Orçamentos,
Prestação de contas, Direitos e clearance, Produção, Documentação, Assistente da LEP.

---

## 2. Estado atual

**✅ Em produção (informado pela equipe; versão ANTERIOR às etapas 1–12)**: app publicado na Vercel; banco remoto
sincronizado pelo workflow de migrações; varredura real executada (resultado relatado: 10 em acompanhamento, 6 novas
da varredura, 5 descartadas; fontes Spcine, RioFilme, ANCINE/FSA). Login por convite, papéis, RLS, auditoria;
editais (lista, detalhe, cadastro por link/PDF/manual, revisão humana, triagem); projetos; Match ✓/⚠/✕; varredura
diária + "Verificar agora"; diretrizes territoriais; Diagnóstico; migrações automáticas.

**✅ Implementado e testado no branch `claude/melhorias-editais` (etapas 1–12; ainda NÃO integrado à produção)** —
detalhes em §2.1 e §3.

**🟡 Dependem da LEP / de produção**: SMTP e modelo de convite no Supabase (etapa 3); planilha das 38 oportunidades
(etapa 4); endereços oficiais e teste das novas fontes no site real (etapa 11); escolha do fornecedor de IA (etapa 12);
decisão de integrar o branch à produção (aplica 10 migrações novas pelo workflow; 15 no total).

**⬜ Planejado**: alertas por e-mail, Diários Oficiais, OCR (se necessário), tela de parcerias, módulos futuros.

### 2.1 Plano de melhorias — resumo das 12 etapas

| #   | Etapa                                        | Status | Commit    | Migração                               | ADR  | O que entrega                                                                                                                                                                                                                     |
| --- | -------------------------------------------- | ------ | --------- | -------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Logo                                         | ✅     | `f28c329` | —                                      | —    | Logo oficial em alta resolução (`public/brand/lep-logo.png`) no cabeçalho e no login, proporção preservada (desktop/celular); `logo.jpg` antigo mantido só para reversão                                                          |
| 2   | Fontes ativas + diagnóstico + resumo         | ✅     | `1372d51` | `20260930120000_monitor_resumo`        | —    | `checkMonitorAccess` compara fontes ativas (tela × motor) e identifica o tipo da chave de serviço; "Verificar agora" com resumo por fonte e total; histórico preservado                                                           |
| 3   | Membros e perfis                             | ✅ ⚠   | `3d9a375` | `20261001120000_membros_status`        | 0015 | Administrador/Diretoria/Equipe = admin/editor/viewer; vínculo convidado/ativo/suspenso travado no banco; convidar, reenviar, suspender, reativar; convite via Supabase Auth no servidor após checar admin; nenhuma senha guardada |
| 4   | Benchmark                                    | 🟡     | `c8a5953` | —                                      | —    | `pnpm benchmark:editais` (acurácia por campo, erros graves, `--json`, `--min-accuracy`), fora do código de produção; exemplos fictícios; **casos reais pendentes** (planilha das 38)                                              |
| 5   | Taxonomia em 3 eixos + elegibilidade         | ✅     | `e9e8f29` | `20261002120000_elegibilidade`         | 0016 | Situação · triagem · elegibilidade separadas; restrição territorial visível com trecho (sem descarte automático, sem exceção fixa para RioFilme); "não elegível" só por decisão humana; filtros por eixo; detalhe em abas         |
| 6   | Classificador de página + adaptador de fonte | ✅     | `ac4c20f` | `20261003120000_classificador_paginas` | 0017 | Resultado, notícia, institucional e índices ficam fora (com motivo, "Páginas ignoradas", "Reavaliar"); configuração por fonte sem seletores CSS                                                                                   |
| 7   | Extração ampliada + evidência + PDF          | ✅     | `cd39a47` | `20261004120000_evidencias`            | 0018 | Texto de PDF com `pdfjs-dist` (sem OCR); prazo, abertura, valores, nº de projetos, formatos, gêneros, estágios, cada um com trecho e origem; regulamento em PDF seguido pela varredura; aba "Dados e evidências"                  |
| 8   | Deduplicação multi-fonte                     | ✅     | `9516843` | `20261005120000_deduplicacao`          | 0019 | Chave canônica (número/ano + título + prazo); mesmo edital em outra fonte vira avistamento; possível duplicado com aviso e decisão da equipe; "Onde foi encontrado"                                                               |
| 9   | Aderência explicável + Match v2              | ✅     | `a29f0ad` | `20261006120000_match_v2`              | 0020 | Fatores com peso, pontuação, confiança, impedimentos; "Dados insuficientes" em vez de "Baixa"; tabela "Como a aderência foi calculada"; gravado em `edital_matches`                                                               |
| 10  | Alterações e retificações                    | ✅     | `3f2ef74` | `20261007120000_alteracoes`            | 0021 | Re-verificação periódica e manual; retificações guardadas; alteração pendente (antes → depois + trecho); nada sobrescrito sem a equipe aplicar                                                                                    |
| 11  | Novas fontes                                 | 🟡     | `e0a19ac` | —                                      | 0022 | Catálogo Cultura SP/SCEIC, MinC, BRDE/FSA, Prosas, patrocinadores (sem endereço inventado); "Testar fonte" sem gravar; entram pausadas; **endereços e teste no site real pendentes**                                              |
| 12  | Interface `EditalAnalyzer`                   | ✅     | `013dcef` | —                                      | 0023 | Contrato único de IA sem fornecedor (`NoopEditalAnalyzer` padrão); adaptador para qualquer `AiProvider`; trecho literal obrigatório, nenhuma afirmação de aprovação, "não elegível" só humano; nenhum SDK de IA                   |

✅ ⚠ = código pronto e testado; depende de configuração manual em produção (§5).

---

## 3. Módulo Captação de Recursos / Editais

### Funcionalidades atuais (✅ no branch)

- **Listagem** `/editais`: colunas Oportunidade · Instituição · Prazo · Valor · Aderência (Match) (inalteradas);
  filtros em três eixos — **Triagem** (Em acompanhamento, Novos da varredura, Revisão pendente, Descartados),
  **Elegibilidade** (Todas, Elegíveis, Não confirmadas, Necessita revisão, Com restrição) e **Situação** (Abertas, Em
  breve, Encerradas, Não informada); selos de elegibilidade, varredura, possível duplicado e alteração a revisar.
  Leitura com `select("*")` e normalização defensiva (`toEdital`).
- **Detalhe** `/editais/[id]` em abas: **Dados e evidências** (fatos, resumo, critérios, tipo de página, evidência por
  campo, onde foi encontrado) · **Elegibilidade** (motivo, trecho, territórios, decisão da equipe) · **Match**
  (✓/⚠/✕ + fatores; estado do cálculo gravado) · **Documentos** · **Histórico** (alterações detectadas + auditoria
  para admin). Avisos de possível duplicado e de alterações pendentes; botões Editar, Descartar/Restaurar e "Verificar
  alterações agora".
- **Fontes** `/editais/fontes`: cadastro, sugestões e **catálogo de novas fontes**; "Configurar fonte"; "Testar
  fonte"; pausar/reativar/remover; "Verificar agora" com resumo; histórico com Encontradas, Novas, Duplicadas, Com
  restrição, Ignoradas, Erros; **Páginas ignoradas** com "Reavaliar".

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

### Aderência e Match v2 (✅, etapa 9, ADR-0020)

- Regras determinísticas, sem IA, **nunca** previsão de aprovação (`MATCH_DISCLAIMER`).
- Fatores com peso: formato 25 · estágio 20 · orçamento 20 · prazo 20 · gênero 15; situação atende / parcial / não
  atende / **sem dado** (fora da conta). Pontuação 0–100, **confiança** = peso avaliado ÷ peso total.
- Impedimentos (elegibilidade restrita, território, prazo encerrado) → **Baixa**, com o motivo. Confiança < 40% →
  **Dados insuficientes** (incerteza nunca vira "Baixa").
- Painel de Match mantém ✓ / ⚠ / ✕ e ganha a tabela "Como a aderência foi calculada" (fator, peso, situação,
  pontos, motivo). Coluna Aderência mostra nível, pontuação (ou “impedimento”) e confiança do melhor projeto.
- **Persistido** em `core.edital_matches` (versão, pontuação, confiança, nível, fatores, impedimentos, hash dos
  dados), recalculado ao salvar edital/elegibilidade/triagem, cadastrar projeto e na varredura; aba Match mostra se o
  cálculo gravado está em dia (botão "Recalcular e gravar"). Histórico na auditoria.

### Deduplicação (✅ multi-fonte, etapa 8, ADR-0019)

- Continua: mesmo SHA-256 de documento **ou** mesmo link → recusado (cadastro) / ignorado (varredura).
- **Impressão digital** (`packages/modules/funding/src/dedup.ts`): número/ano do edital ("Edital nº 5/2026", do
  título ou do texto) + palavras significativas do título + prazo. Chave canônica em `editais.canonical_key`.
- **Mesmo edital** (mesmo número e títulos parecidos, ou título quase igual e mesmo prazo) encontrado em outra fonte
  → vira **avistamento** (`core.edital_sightings`), não edital novo. Números ou prazos diferentes → editais
  diferentes (ex.: edições anuais).
- **Possível duplicado** (títulos parecidos, sem confirmação) → o edital entra com aviso e link para o parecido; a
  equipe decide ("Não é duplicado" / "É duplicado — descartar este"). Nada é escondido nem apagado.
- Detalhe → Dados e evidências → "Onde foi encontrado" (fontes, endereços, motivo); selo "Possível duplicado" na lista.

### Benchmark (🟡 estrutura pronta; casos reais pendentes)

- `pnpm benchmark:editais` compara o motor atual com casos conferidos por uma pessoa: por campo (é oportunidade,
  território, elegibilidade, prazo, valor, situação) mostra acertos, erros, **erros graves** (descartar o que não era
  inelegível) e campos **sem avaliador** (nunca contam como acerto). Opções `--json` e `--min-accuracy`.
- Fora do código de produção (`packages/modules/funding/benchmark/`). Exemplos versionados são **fictícios**; casos
  reais ficam em `benchmark/private/` (ignorada pelo Git) ou `--cases`.
- Avaliadores atuais: é oportunidade, tipo de página, território, elegibilidade, prazo, valor total, valor por projeto,
  quantidade de projetos e situação (atualizados nas etapas 5–7).
- Resultado com os 6 exemplos fictícios (após as etapas 5–7): 100% em todos os campos avaliados, 0 erros graves.
  Exemplos fictícios não medem a qualidade real — isso depende dos casos da planilha.
- **Dependência externa:** a planilha das 38 oportunidades (26/09/2026) não está no repositório.

### Fluxo de monitoramento (✅, ADR-0012; ampliado nas etapas 2 e 5–11)

```
Vercel Cron diário 10:00 UTC (7h Brasília) → GET /api/cron/monitor (Bearer CRON_SECRET)
  ou "Verificar agora" (admin) — antes, checkMonitorAccess compara fontes ativas (sessão × chave de serviço)
→ runMonitor (cliente com chave de serviço): fontes active = true, cada uma com seu adaptador (adapter_config)
→ por fonte: robots.txt → página de listagem → extractLinks → selectCandidates (termos de edital + audiovisual,
   exclusões do adaptador; pula links conhecidos, avistados e páginas ignoradas; até maxImports/fonte, 50 s no total)
→ por candidato: baixa (sem guardar) → classifyPage
   ├─ resultado/notícia/institucional/índice/retificação → monitor_ignored_urls (motivo) → fim
   ├─ mesmo edital já cadastrado (fingerprint) → edital_sightings (avistamento) → fim
   └─ oportunidade/incerta → guarda cópia → cria edital (origin = monitor, revisão pendente)
        → segue o regulamento em PDF (anexo) → extractFields (valores + evidência) → assessEligibility
        → possível duplicado, chave canônica, avistamento de origem, linha de base (hash do texto)
        → Match v2 gravado (edital_matches)
→ re-verifica até 2 editais abertos da fonte (≥ 20 h): retificações/alterações → edital_changes (pendente)
→ grava monitor_runs (encontradas, novas, atualizadas, duplicadas, com restrição, ignoradas, pendentes,
   bloqueadas pelo robots.txt, falhas, execution_id) e o status da fonte; resumo por fonte na tela
```

### Fontes monitoradas (✅)

Sugestões no código: **RioFilme** (`/editais/`), **Spcine** (`/editais/`), **ANCINE/FSA**. Cadastro por página de
listagem com opções "fonte exclusiva de audiovisual" e filtro de endereço.

### Alterações e retificações (✅, etapa 10, ADR-0021)

- A varredura verifica de novo os editais abertos de cada fonte (até 2 por fonte por execução, no mínimo a cada 20 h;
  também pelo botão **"Verificar alterações agora"** no detalhe). Compara o **texto** da página (hash): mudanças só
  de layout não geram alerta; na importação fica a linha de base.
- Retificação/errata/aditivo/prorrogação linkada na página → guardada como documento `rectification`; o regulamento
  novo é guardado como nova versão; a extração roda de novo e `diffFields` compara com os valores atuais.
- Resultado: `core.edital_changes` **pendente** (antes → depois + trecho). **Nada é sobrescrito**: a equipe
  **aplica os valores novos** (recalcula o Match) ou **ignora**; o banco registra quem resolveu e quando.
- Aviso no detalhe, selo "Alteração a revisar" na lista, contador "Atualizadas" no resumo da varredura.

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

### Novas fontes por configuração (🟡, etapa 11, ADR-0022)

- **Catálogo** (`apps/web/src/lib/monitor/catalog.ts`): Cultura SP (SCEIC), Ministério da Cultura, BRDE/FSA, Prosas
  (agregador) e modelo para programas de patrocínio — só regras do adaptador (exclusões, limites), **sem seletores
  CSS** e **sem endereço preenchido** (nenhum endereço inventado).
- Fontes > Catálogo: colar a página oficial → **Testar** → **Adicionar (pausada)**. Toda fonte tem **"Testar fonte"**:
  robots.txt, página, links, oportunidades e amostra classificada, **sem gravar nada**. Ativar ("Reativar") só
  depois do teste.
- **Pendente (depende da LEP/admin em produção):** informar os endereços oficiais e testar cada fonte no site real —
  a rede deste ambiente bloqueia sites externos, então nenhuma dessas fontes foi testada contra o site verdadeiro.

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

**Fechamento da V1 para apresentação (2026-09-30)** — telas de "planta" viraram V1 demonstrável: Home com 5
indicadores, Editais com indicadores e **Analisar Edital** (PDF → análise → Adicionar aos Editais), Buscar Editais
simplificado, Produções Concluídas + ficha compartilhada (trailer de A Conspiração Condor), Produções Atuais e
Equipe Audiovisual com dados demonstrativos em código. **Sem migração.** Detalhes em **§17**. Sem merge/deploy.

**Criação direta de membros + Minha conta + foto de perfil (2026-09-30, ADR-0025)** — ADM cria acesso com senha
inicial (sem SMTP), nome e foto aparecem na Home e no menu; **1 migração nova** (`20261010120000_avatares`).
Detalhes em **§16**. Sem merge; aguardando revisão.

**Fechamento da versão atual (2026-09-30)** — menu lateral, Home, Buscar Editais com resultado na própria tela,
Produções (nome na interface), Membros simplificado e plantas de Produções Atuais, Orçamentos e Equipe Audiovisual.
**Sem migração.** Detalhes, testes e pendências em **§15**. Aguardando revisão humana; sem merge.

**Descoberta web de oportunidades audiovisuais + fontes favoritas ⭐ (2026-09-29, ADR-0024)** — nova camada que busca
oportunidades na web (inclusive em instituições não cadastradas) e entrega ao pipeline existente. Detalhes, testes,
variáveis e pendências em **§14**. Nenhum provedor de busca foi configurado nem testado com a API real.

**Auditoria final pré-merge (2026-09-29)** — nenhuma funcionalidade nova. Resultado em §4.1. Única correção de
código: `83f8444` (regressão de acesso antes da migração de status dos vínculos, ver §4.1 item 1).

### 4.1 Auditoria pré-merge (2026-09-29)

**Recomendação técnica:** ✅ **pronto para revisão humana de merge**, com duas condições: (1) as migrações
novas (hoje 10: `20260930120000` a `20261009120000`) devem ser aplicadas pelo workflow `supabase-migrations.yml` **junto com ou antes** do deploy do código;
(2) confirmar antes do merge qual é o valor de `SUPABASE_MIGRATIONS_BRANCH` (não verificável daqui). Não há
merge, deploy nem migração em produção feitos por esta auditoria.

**Por etapa:** 1, 2, 3, 5, 6, 7, 8, 9, 10 e 12 implementadas e testadas (3 depende de SMTP/modelo de convite em
produção); 4 parcial (estrutura pronta, casos reais dependem da planilha da LEP); 11 parcial (catálogo e "Testar
fonte" prontos, endereços oficiais e teste no site real dependem da LEP). Nenhuma inconsistência entre código,
migrações e testes SQL encontrada além do item 1 abaixo.

**Problemas encontrados**

1. **Corrigido (`83f8444`) — regressão da etapa 3:** `getSession` passou a ler `memberships.status`; se o código
   fosse publicado antes da migração `20261001120000`, a consulta falharia (coluna inexistente, erro 42703) e
   **todos, inclusive o administrador, perderiam o acesso**. Agora, nesse erro, volta ao comportamento anterior
   (vínculo existente = ativo). Testes novos em `apps/web/src/lib/auth/session.test.ts` (pré-migração, ativo,
   suspenso, convidado).
2. **Registrado (não corrigido) — varredura antes das migrações:** `lib/monitor/run.ts` seleciona
   `edital_sources.adapter_config` (migração `20261003120000`); sem a migração a varredura/cron falha com erro de
   banco. Gravações nas colunas novas (evidências, deduplicação, alterações) também falham antes das respectivas
   migrações. Mitigação: aplicar as migrações antes ou junto do deploy (o Diagnóstico aponta migrações faltantes).
3. **Registrado — `SUPABASE_MIGRATIONS_BRANCH` desconhecido:** se for `claude/epic-cerf-abwkc1`, o merge (push que
   altera `supabase/migrations/`) dispara a aplicação automática das 10 migrações novas em produção. O workflow também
   aceita execução manual (`workflow_dispatch`) de qualquer branch.
4. **Registrado — datas das migrações no futuro** (`20260930…` a `20261007…`, hoje é 2026-09-29): uma migração nova
   criada nos próximos dias com data "de hoje" ficaria **antes** delas na ordem. O workflow usa `--include-all`, então
   ela seria aplicada, mas fora da ordem lógica. Novas migrações devem usar data posterior a `20261007120000`.
5. **Registrado — PDF na Vercel não verificado:** `pdfjs-dist` funciona no build e nos testes locais, mas não foi
   executado na Vercel; o binário opcional `@napi-rs/canvas` (~34 MB) pode entrar no pacote da função.
6. **Registrado — tempo de execução:** o cron tem `maxDuration = 60` s e limite interno de 50 s; um candidato com
   regulamento em PDF + re-verificações pode ser lento. "Verificar agora" (`runMonitorNow`) não define `maxDuration`
   (usa o padrão da Vercel).
7. **Não validado:** sites e PDFs reais (a rede deste ambiente bloqueia sites externos); benchmark sem casos reais
   (6 casos fictícios, 100%); SMTP; fornecedor de IA.

**Segurança (revisada):** chave de serviço só em cron, `runMonitorNow` (admin), membros (após
`requireMembership("admin")`) e `lib/monitor/access.ts`, sempre com `org_id`; todo download externo via `safeFetch`
(anti-SSRF), exceto `/api/health`, que só consulta o próprio Supabase (`NEXT_PUBLIC_SUPABASE_URL`); nenhum
`dangerouslySetInnerHTML`; nenhum segredo no código; todas as Server Actions checam papel; RLS com `core.has_role` em
todas as tabelas novas (testado); upload/download de PDF inalterados (bucket privado, pasta `<org_id>`, SHA-256);
regras territoriais sem descarte automático; Match nunca afirma aprovação; deduplicação e alterações só propõem
(decisão da equipe); `EditalAnalyzer` não está ligado a nenhum fluxo (padrão sem fornecedor).

**Simulação de atualização (local):** banco com as 5 migrações antigas + dados fictícios, depois as 8 novas da época 2x (simulação feita antes das migrações da descoberta web):
vínculos existentes continuam ativos (admin incluído); descartes automáticos antigos viram "pendente / restrição
territorial" com trecho; descartes humanos mantidos; histórico preservado.

**Plano de melhorias de Editais (etapas 1–12), branch `claude/melhorias-editais`** — um commit por etapa (§12).
Última etapa: **`EditalAnalyzer`** em `packages/ai` (ADR-0023) — contrato único de análise por IA, padrão sem
fornecedor (`NoopEditalAnalyzer`), adaptador genérico para qualquer `AiProvider` e regras de segurança
(`validateAnalysis`): trecho literal obrigatório, nenhuma afirmação de aprovação, "não elegível" só por decisão
humana. Nenhum SDK de IA adicionado. Nenhuma migração nova nesta etapa.

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
- **Tabelas (`core`):** `organizations`, `profiles`, `memberships`, `audit_log`, `ai_usage`, `editais`, `projetos`,
  `edital_documents`, `edital_sources`, `monitor_runs`; novas no branch: `monitor_ignored_urls` (etapa 6),
  `edital_sightings` (etapa 8), `edital_matches` (etapa 9), `edital_changes` (etapa 10), `discovery_runs` e
  `discovery_candidates` (descoberta web), `search_api_usage` (contador mensal de chamadas à API de busca).
- **Colunas novas relevantes:** `memberships.status/invited_at/accepted_at/suspended_*`; `editais.eligibility_*`,
  `page_type/opportunity_kind/page_type_reasons`, `field_evidence/extraction_notes/extracted_at`,
  `canonical_key/possible_duplicate_*`, `last_checked_at/content_hash`; `edital_sources.adapter_config`;
  `organizations.partner_territories` (reservada, sem tela); contadores novos em `monitor_runs`.
- **Funções:** `has_role`, `role_in_org` (só vínculos ativos), `try_uuid`, `create_edital_with_document`,
  `accept_my_invitations`, `guard_membership_status`, `stamp_edital_change_resolution`,
  `reserve_search_request` (reserva atômica de chamada à API de busca; só chave de serviço), triggers de
  auditoria/updated_at/perfil/último admin ativo.
- **Storage:** bucket privado `edital-documents` (PDF/HTML, 25 MB), caminho `<org_id>/...`.
- **Migrations** (`supabase/migrations/`, todas idempotentes — ADR-0014):
  `20260925120000_core_foundation` · `20260926120000_editais_projetos` · `20260927120000_edital_documents` ·
  `20260928120000_monitoramento` · `20260929120000_diretrizes_territorio` · `20260930120000_monitor_resumo` · `20261001120000_membros_status` ·
  `20261002120000_elegibilidade` · `20261003120000_classificador_paginas` ·
  `20261004120000_evidencias` · `20261005120000_deduplicacao` · `20261006120000_match_v2` · `20261007120000_alteracoes` · `20261008120000_descoberta_web` · `20261009120000_descoberta_limites`
  (**15 no total; 10 novas no branch**, de `20260930120000` a `20261009120000`)
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
- **Auditoria:** trigger genérico em organizações, vínculos, editais, projetos, documentos, fontes, Match
  (`edital_matches`) e alterações (`edital_changes`).
- **Secrets:** nunca no código; `.env*` fora do Git; chave de serviço só no servidor e de uso restrito (varredura,
  cron, diagnóstico e convites — só depois de `requireMembership("admin")`, sempre com o `org_id` do admin);
  diagnóstico mostra só o TIPO da chave, nunca o valor; segredo do cron comparado em tempo constante; senha do banco
  mascarada no workflow.
- **Membros:** status do vínculo imposto pelo banco; ninguém suspende o próprio acesso; sempre um admin ativo; a
  plataforma não pede nem guarda senhas.
- **PDF:** `pdfjs-dist` sem XFA/WebAssembly/fontes do sistema, com limites de páginas, caracteres e tempo.
- **IA (etapa 12):** nenhum fornecedor; `validateAnalysis` exige trecho literal, remove afirmações de aprovação e
  nunca produz "não elegível"; dados de projetos da LEP não entram na análise.
- **Revisão humana:** nenhum edital é validado sem confirmação explícita; importados pela varredura entram pendentes.
- **Coleta responsável:** anti-SSRF, `robots.txt`, sem login em sites de terceiros, HTML capturado nunca exibido
  (só baixado).
- **Isolamento de módulos:** um schema/pacote por domínio; módulos não acessam tabelas internas de outros; IA só via
  `packages/ai` (contrato `AiProvider` + registro de custo).

---

## 8. Testes (reexecutados em 2026-09-29 após a descoberta web, commit `81af51e`)

| Verificação                                              | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formatação (Prettier), lint (ESLint), tipos (TypeScript) | ✅ sem erros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Testes unitários/integração (Vitest)                     | ✅ **328** passando — core 8, ai 10 (inclui `EditalAnalyzer`), projects 3, ingestion 54 (inclui texto de PDF e cabeçalhos extras no `safeFetch`), funding 172 (inclui benchmark, elegibilidade, classificador, extração, deduplicação, Match v2, alterações e **descoberta web: audiovisual por objeto, consultas, triagem, fonte oficial**), web 81 (inclui **descoberta web ponta a ponta com provedor e sites fictícios** e o adaptador Brave com resposta simulada) (inclui `getSession` antes/depois da migração de status; catálogo e “Testar fonte”) (inclui integração da varredura com site e Supabase simulados e `checkMonitorAccess` com chave correta, divergente, publishable, anon, ausente e com erro; convites/reenvio de membros com Supabase Auth simulado) |
| Testes SQL de RLS (PostgreSQL 16 + simulação Supabase)   | ✅ **221** verificações em 14 arquivos (inclui descoberta web e favoritas — teste 014; inclui status do vínculo: convite, aceite, suspensão, reativação, último admin ativo; elegibilidade e conversão dos descartes automáticos; classificador e configuração por fonte; evidências; deduplicação; Match v2; alterações), com migrações aplicadas 2x                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Cenário "remoto parcialmente migrado à mão"              | ✅ alinhado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Instalação `pnpm install --frozen-lockfile`              | ✅ sem alterar o lockfile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Benchmark (`pnpm benchmark:editais`)                     | ✅ 14 casos fictícios (6 + 8 de tema × objeto audiovisual), 100% (audiovisual 8/8); **0 casos reais**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CI no GitHub (`ci.yml`)                                  | ✅ sucesso em todos os commits do branch até `37a684f` (consultado via API); workflow de migrações ignorado no branch (esperado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Build de produção (Next.js 16)                           | ✅ 16 rotas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Problemas conhecidos**

1. 🟡 Páginas genéricas: o classificador (etapa 6) deixa de fora resultados, retificações, notícias, páginas
   institucionais (ex.: "Programa de Integridade") e índices (ex.: "Chamamento Público"), com o motivo. Validado com
   páginas fictícias e o benchmark; **não validado em sites reais** (a rede deste ambiente bloqueia sites externos).
2. PDFs digitalizados (imagem) não são lidos: não há OCR (decisão da etapa 7); a interface avisa para conferir.
3. 🟡 Alterações/retificações: detectadas por regras (etapa 10); a varredura verifica até 2 editais abertos por fonte
   por execução (a cada 20 h no mínimo). Não validado em sites reais.
4. Limites: até 5 novas por fonte (configurável de 1 a 10), 2 re-verificações por fonte, 50 s por execução; cron diário.
5. Não verificado a partir daqui: configuração de e-mail/SMTP e modelos no Supabase de
   produção, sites e PDFs reais (rede do ambiente bloqueia sites externos; validação com Supabase e sites simulados).

---

## 9. Documentação e arquivos importantes

| Arquivo                                                     | Função                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `README.md`                                                 | Como rodar, comandos, produção, solução de problemas                                                      |
| `CLAUDE.md`                                                 | Regras obrigatórias para agentes (diretrizes LEP e convenções)                                            |
| `docs/STATUS-PLATAFORMA-LEP.md`                             | Este documento (estado atual oficial)                                                                     |
| `docs/arquitetura.md`                                       | Estrutura de pastas e checklist para novos módulos                                                        |
| `docs/diretrizes-lep.md`                                    | Regras de negócio da LEP (território, foco na LEP, tabela/Match)                                          |
| `docs/adr/0001…0023`                                        | Decisões de arquitetura (índice em `docs/adr/README.md`)                                                  |
| `supabase/migrations/*`                                     | Estrutura do banco (idempotente)                                                                          |
| `supabase/tests/*`                                          | Testes SQL de permissão; `scenarios/` = banco parcial                                                     |
| `supabase/scripts/diagnostico.sql`                          | Diagnóstico somente leitura para o SQL Editor                                                             |
| `supabase/config.toml`, `supabase/templates/*`              | Supabase local e e-mails de convite/recuperação                                                           |
| `.github/workflows/ci.yml`                                  | CI (qualidade, testes, build, migrações)                                                                  |
| `.github/workflows/supabase-migrations.yml`                 | Aplicação automática de migrações em produção                                                             |
| `apps/web/vercel.json`                                      | Agendamento do cron                                                                                       |
| `apps/web/src/lib/monitor/run.ts`                           | Motor da varredura e "Testar fonte" (`previewSource`)                                                     |
| `apps/web/src/lib/monitor/{access,summary,catalog}.ts`      | Checagem tela × motor, resumo da execução, catálogo de novas fontes                                       |
| `apps/web/src/lib/members/invite.ts`                        | Convite/reenvio de membros (Supabase Auth, só após checar admin)                                          |
| `apps/web/src/lib/editais/{extraction,matches,changes}.ts`  | Sugestões com evidência, Match v2 gravado, detecção de alterações                                         |
| `apps/web/src/lib/editais/ingest.ts`                        | Ingestão (download/upload, cópia, duplicidade)                                                            |
| `apps/web/src/lib/diagnostics.ts`, `lib/supabase/errors.ts` | Diagnóstico e tradução de erros do banco                                                                  |
| `apps/web/src/lib/supabase/{server,client,admin,proxy}.ts`  | Clientes Supabase (sessão, navegador, serviço)                                                            |
| `packages/modules/funding/src/*`                            | Edital, elegibilidade, classificador, extração, deduplicação, Match v2, alterações, adaptador, território |
| `packages/modules/funding/benchmark/*`                      | Benchmark (`pnpm benchmark:editais`); casos reais em `private/` (fora do Git)                             |
| `packages/modules/projects/src/*`                           | Vocabulário e validação de projetos                                                                       |
| `packages/ingestion/src/*`                                  | Download seguro, robots.txt, leitura de HTML, hash, texto de PDF                                          |
| `packages/core/src/auth/*`                                  | Papéis e permissões                                                                                       |
| `packages/ai/src/*`                                         | Contrato de IA, registro de custos e `EditalAnalyzer` (sem fornecedor)                                    |
| `apps/web/scripts/invite-member.ts`                         | Convite de membros por linha de comando                                                                   |
| `apps/web/public/brand/lep-logo.png`                        | Logo oficial em uso (alta resolução, `lib/brand.ts`)                                                      |
| `apps/web/public/logo.jpg`                                  | Logo antigo — sem uso, mantido só para reversão                                                           |

---

## 10. Pendências

0. ✅ **Ambiente de teste (staging) executado** (§13): projeto Supabase de TESTE criado, workflow de staging aplicando
   as migrações (15), Preview com login funcionando. Pendente: primeiro teste real da descoberta web (§14.1).
1. **Antes do merge:** confirmar `SUPABASE_MIGRATIONS_BRANCH`; planejar o deploy para que as 10 migrações novas sejam
   aplicadas pelo workflow antes ou junto do código (§4.1 itens 2–3); depois do deploy, rodar o Diagnóstico e uma
   varredura manual e conferir PDF/tempo na Vercel (§4.1 itens 5–6).
2. Configurar em produção: SMTP próprio, modelo de e-mail de convite e URLs de redirecionamento do Supabase Auth.
3. Benchmark: enviar a planilha das 38 oportunidades e transformá-la em casos (em `benchmark/private/`, fora do Git).
4. Novas fontes: colar os endereços oficiais no catálogo, testar e ativar (produção).
5. Integrar o branch `claude/melhorias-editais` ao branch de produção (decisão da LEP; aplica as migrações
   `20260930120000` a `20261009120000` — **10 migrações novas**, 15 no total — pelo workflow).
6. Descoberta web (§14): LEP escolher/contratar o provedor de busca, configurar as variáveis no Preview, testar pelo
   botão e só depois agendar o cron.
7. IA: `EditalAnalyzer` pronto (etapa 12); falta a LEP escolher o fornecedor para implementar um `AiProvider`.
8. Alertas por e-mail.

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
7. ✅ Deduplicação multi-fonte (chave canônica + avistamentos) (etapa 8).
8. ✅ Aderência por fatores e Match v2 gravados (etapa 9).
9. ✅ Detecção de alterações/retificações com revisão (etapa 10).
10. 🟡 Novas fontes por configuração (etapa 11): catálogo + "Testar fonte"; **falta** colar os endereços oficiais e
    testar no site real (depende do administrador em produção).
11. ✅ IA atrás de uma interface única de análise (`EditalAnalyzer`) em `packages/ai`, sem fornecedor (etapa 12).

---

## 12. Estado do Git

| Item                       | Valor                                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório                | `giuliano-prog/LEP-agente-editais`                                                                                                                                                                                            |
| Branch de trabalho         | `claude/melhorias-editais` (base `d6b5af1`), enviado ao remoto; **sem merge**                                                                                                                                                 |
| Branch de produção         | não alterado nesta tarefa; `claude/epic-cerf-abwkc1` não foi tocado                                                                                                                                                           |
| Commits (um por etapa)     | `f28c329` logo · `1372d51` fontes/resumo · `3d9a375` membros · `c8a5953` benchmark ·                                                                                                                                          |
|                            | `e9e8f29` taxonomia · `ac4c20f` classificador · `cd39a47` evidência/PDF ·                                                                                                                                                     |
|                            | `9516843` deduplicação · `a29f0ad` Match v2 · `3f2ef74` alterações · `e0a19ac` fontes ·                                                                                                                                       |
|                            | `013dcef` EditalAnalyzer                                                                                                                                                                                                      |
|                            | `37a684f` STATUS · `83f8444` correção de acesso (auditoria) · commit desta atualização                                                                                                                                        |
|                            | `7168853` plano de staging · `721378d` workflow de staging · `5ba040f` disparo (jobs pulados) · `b7ba880` disparo (trava recusou a URL) · `b9cbce6` disparo (conexão recusada) · `f1f4cd2` disparo (✅ 13 migrações no teste) |
| Remoto (2026-09-29)        | `claude/epic-cerf-abwkc1` = `d6b5af1` (HEAD padrão, intocado); não existe `main`                                                                                                                                              |
|                            | Descoberta web: `ad9d6a3` lógica pura · `45b64ac` migração · `52322e3` pipeline reutilizável · `0c7ef95` orquestração · `81af51e` interface · commit de documentação                                                          |
|                            | Descoberta web — limites: `f47dad9` contador mensal · `e9281ff` busca/triagem/limites · commit de documentação                                                                                                                |
|                            | Fechamento da versão (2026-09-30): `66f6b7c` navegação+Home · `aeb72d5` Editais/Buscar Editais · `f7119d1` Produções + plantas · `61554e6` Equipe Audiovisual · `4f8a6e6` Membros/permissões · commit de documentação         |
|                            | Criação direta de membros/foto (2026-09-30): commits desta tarefa (migração + app + docs)                                                                                                                                     |
| Alterações não commitadas  | nenhuma após o commit desta auditoria                                                                                                                                                                                         |
| Migrações novas (produção) | nenhuma aplicada manualmente; entram pelo workflow quando o branch for integrado                                                                                                                                              |

---

## 13. Ambiente de teste (staging) — ✅ migrações aplicadas no Supabase de TESTE pelo workflow (13 em 2026-09-29, depois 14 e 15 — §14/§14.2)

Objetivo: testar as 12 etapas completas no Preview da Vercel do branch `claude/melhorias-editais` com um **segundo
projeto Supabase, gratuito e separado**, sem tocar no Supabase de produção. Análise feita em 2026-09-29 a partir do
repositório; a configuração atual da Vercel e dos projetos Supabase **não é visível daqui** (itens marcados
"não verificado").

### 13.1 O que o repositório mostra

- **Migrações:** um banco novo e vazio precisa de **todas as 13** (`20260925120000` … `20261007120000`), não só das 8
  novas: as 5 antigas criam a base (organizações, editais, documentos, fontes, território). Todas são idempotentes e
  já passam no CI do zero, 2x e sobre banco parcial. O bucket `edital-documents` é criado pela migração
  `20260927120000`.
- **Workflow `supabase-migrations.yml` NÃO serve para o teste:** usa sempre o segredo `SUPABASE_DB_URL` do ambiente
  `production`. ⚠ **Rodá-lo manualmente (Run workflow) a partir de qualquer branch, inclusive
  `claude/melhorias-editais`, aplicaria as migrações novas (hoje 10) na PRODUÇÃO.** Em push, só roda no branch definido por
  `SUPABASE_MIGRATIONS_BRANCH` (padrão `main`; valor real não verificado).
- **Execução manual do GitHub (`workflow_dispatch`)** só fica disponível para workflows que existem no branch padrão
  (`claude/epic-cerf-abwkc1`, que não pode ser alterado). Por isso um workflow de teste precisa rodar por **push**
  no branch `claude/melhorias-editais`.
- **O app só lê 5 variáveis:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SITE_URL` (opcional), `CRON_SECRET`. Trocar essas 5 no Preview basta para apontar o app para
  outro Supabase; nenhuma mudança de código é necessária para isso.
- **Cron:** a Vercel só executa cron em deploy de produção; no Preview a varredura é testada pelo botão
  "Verificar agora" (admin).
- **E-mails de convite/recuperação** usam `{{ .SiteURL }}/auth/confirm?token_hash=…` (`supabase/templates/`): a Site
  URL do Supabase de teste precisa ser o endereço do Preview.
- **Seed (`supabase/seed.sql`)**: só dados fictícios; pode ser usado no teste (nunca em produção), opcional.
- **Rede deste ambiente do Claude:** só HTTPS por proxy; não alcança o PostgreSQL (porta 5432) nem o painel. O Claude
  não aplica migrações direto nem deve receber senha de banco.

### 13.2 ⚠ Risco a verificar ANTES de tudo

Se as variáveis do Supabase na Vercel foram cadastradas para "All Environments" (Production + Preview), **o Preview
do branch `claude/melhorias-editais` já aponta para o Supabase de PRODUÇÃO** (sem as migrações novas). Nesse caso o
Preview pode gravar dados reais (ex.: "Verificar agora", Membros) e várias telas falham. Não verificado daqui. Até o
staging existir, não usar o Preview desse branch com login de produção.

### 13.3 Plano (ordem segura)

| #   | Passo                                                                                                                                                                                                                                                                                                                                             | Quem       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Vercel → Settings → Environment Variables: conferir se as 5 variáveis estão marcadas também em **Preview** (§13.2).                                                                                                                                                                                                                               | LEP        |
| 2   | Supabase → **New project** numa organização no plano **Free** (nome ex.: `lep-plataforma-teste`), senha do banco forte guardada só com a LEP.                                                                                                                                                                                                     | LEP        |
| 3   | No projeto de teste: Data API → Exposed schemas + `core`; Authentication → desligar "Allow new users to sign up"; Site URL = endereço fixo do Preview do branch; Redirect URLs = esse endereço com `/**`; Emails → colar `invite.html` e `recovery.html`. SMTP próprio não é necessário (o envio padrão entrega a membros da equipe do Supabase). | LEP        |
| 4   | GitHub → Settings → Environments → **novo ambiente `staging`** (nunca `production`): segredo `STAGING_SUPABASE_DB_URL` e variável `PRODUCTION_SUPABASE_REF`. Depois, e só depois, a variável de repositório `STAGING_MIGRATIONS_ENABLED = true` (§13.6).                                                                                          | LEP        |
| 5   | ✅ **Feito (2026-09-29):** `.github/workflows/supabase-migrations-staging.yml` + trava `scripts/check-staging-db-url.py` (§13.6). **Nunca executado.**                                                                                                                                                                                            | Claude     |
| 6   | Com o passo 4 pronto, o Claude faz um push que altera o workflow (ex.: comentário) → o workflow testa em banco descartável e aplica as 13 migrações **só no banco de teste**; conferir o log do Actions.                                                                                                                                          | Claude/LEP |
| 7   | Vercel → Environment Variables → para **Preview** (de preferência só no branch `claude/melhorias-editais`): as 3 chaves do projeto de TESTE (URL, publishable, secret), `SITE_URL` = endereço do Preview, `CRON_SECRET` próprio. Production fica intacto. Redeploy do Preview.                                                                    | LEP        |
| 8   | Primeiro administrador do teste: `pnpm members:invite --email <e-mail> --role admin --yes` com `.env.local` apontando para o projeto de TESTE (cria a organização e envia o convite), ou convite pelo painel + vínculo criado pelo Claude via workflow (a combinar).                                                                              | LEP        |
| 9   | No Preview: Diagnóstico (deve mostrar as 15 migrações), sede do proponente, fontes, "Verificar agora", editais, Match, alterações, Membros. Registrar resultados neste documento.                                                                                                                                                                 | LEP/Claude |

### 13.6 Workflow de staging (criado em 2026-09-29, ainda NÃO executado)

**Arquivos:** `.github/workflows/supabase-migrations-staging.yml` e `scripts/check-staging-db-url.py` (trava). O
workflow de produção `supabase-migrations.yml` não foi alterado.

**Como funciona**

- **Disparo:** só `push` no branch `claude/melhorias-editais` que altere `supabase/migrations/**` ou o próprio
  arquivo do workflow. Sem execução manual (`workflow_dispatch`) e sem outros branches.
- **Interruptor:** os dois jobs só rodam se a variável de repositório `STAGING_MIGRATIONS_ENABLED` for `true`.
  Enquanto ela não existir, os jobs ficam "skipped" (nada é executado, nenhum banco é acessado).
- **Job 1 — banco descartável:** PostgreSQL 17 do próprio Actions; migrações do zero 2x + testes de permissão e
  cenário de banco parcial (mesmo padrão do workflow de produção).
- **Job 2 — banco de TESTE:** só depois do job 1; usa **somente** o ambiente GitHub `staging` e **somente** o
  segredo `STAGING_SUPABASE_DB_URL` (nunca lê `SUPABASE_DB_URL`). Passos: trava → `supabase db push --dry-run
--include-all` → `supabase db push --include-all --yes` (sem seed) → `supabase migration list`.
- **Trava (`check-staging-db-url.py`), antes de qualquer conexão:** mascara a senha nos logs e **falha** se: o
  segredo não existir; a URL não for `postgresql://`, não tiver senha ou usar a porta 6543; a variável
  `PRODUCTION_SUPABASE_REF` faltar; não for possível identificar o projeto Supabase na URL (usuário `postgres.<ref>`
  do Session pooler ou host `db.<ref>.supabase.co`); a URL citar dois projetos; ou **o projeto for o de produção**.

**Validações locais feitas (só estas):** `actionlint` 1.7.7 sem erros nos dois workflows; YAML lido corretamente;
trava executada com 11 URLs fictícias — recusou as 9 inválidas (sem segredo, sem ref de produção, produção via
pooler, produção via host direto, produção em maiúsculas, host desconhecido, porta 6543, sem senha, dois projetos)
e aceitou as 2 de teste (pooler e host direto). `pnpm check` sem erros (291 testes). **Não validado:** execução real no GitHub Actions e conexão com um
Supabase de teste (o projeto ainda não existe).

**O que a LEP precisa fazer no painel (na ordem)**

1. Supabase: criar o projeto de TESTE numa organização **Free** e configurar Auth/Data API (§13.3, passos 2–3).
2. GitHub → Settings → Environments → **New environment** → nome `staging`:
   - **Environment secret** `STAGING_SUPABASE_DB_URL` = connection string do **Session pooler** (porta 5432) do
     projeto de **TESTE** (Supabase → Connect → Session pooler), com a senha percent-encoded;
   - **Environment variable** `PRODUCTION_SUPABASE_REF` = identificador do projeto de **PRODUÇÃO** (o trecho
     `<ref>` do endereço `https://<ref>.supabase.co`; não é segredo).
3. Por último: GitHub → Settings → Secrets and variables → Actions → **Variables** (repositório) →
   `STAGING_MIGRATIONS_ENABLED` = `true`.

**Segredos/variáveis necessários:** `STAGING_SUPABASE_DB_URL` (segredo, ambiente `staging`),
`PRODUCTION_SUPABASE_REF` (variável, ambiente `staging`), `STAGING_MIGRATIONS_ENABLED` (variável de repositório).
Nenhum deles fica em arquivo do repositório.

**Passos que permanecem:** §13.3 passos 1–4 (LEP), 6 (Claude dispara por push), 7–9 (Vercel Preview, primeiro
administrador de teste, testes no Preview).

### 13.7 Primeira tentativa de execução (2026-09-29) — ⚠ jobs pulados, NADA aplicado

- Commit `5ba040f` (só comentário no workflow) enviado ao `claude/melhorias-editais`: o workflow **foi disparado**
  (execução nº 2, id `36515341251`), mas terminou como **"skipped"**: os dois jobs ("Testar migrações (banco
  descartável)" e "Aplicar no Supabase de TESTE") foram **pulados**. Nenhum banco foi acessado e **nenhuma das 13
  migrações foi aplicada no Supabase de staging**.
- Causa (pela configuração do workflow): a condição `vars.STAGING_MIGRATIONS_ENABLED == 'true'` não foi satisfeita.
  Essa variável precisa ser **de repositório** (Settings → Secrets and variables → Actions → aba **Variables** →
  "New repository variable"), com valor exatamente `true`. Variável criada **dentro do ambiente `staging`** não vale
  para essa condição, porque o GitHub avalia a condição do job antes de abrir o ambiente. Não foi possível verificar
  daqui onde a variável foi criada.
- Próximo passo: a LEP cria/ajusta a variável de repositório; o Claude faz outro push só de comentário no workflow.

### 13.8 Segunda execução (2026-09-29) — ⚠ trava recusou, NADA aplicado

- Commit `b7ba880` (só comentário no workflow), execução nº 3 (id `36515860605`), depois de a LEP criar
  `STAGING_MIGRATIONS_ENABLED=true` como variável de repositório.
- **Job 1 "Testar migrações (banco descartável)": ✅ sucesso** — as 13 migrações do zero 2x, testes de permissão e
  cenário de banco parcial passaram no PostgreSQL 17 do Actions.
- **Job 2 "Aplicar no Supabase de TESTE": ❌ falhou no passo da trava**, antes de qualquer conexão. Os passos
  seguintes (instalação do Supabase CLI, simulação, aplicação, histórico) foram **pulados**. **Nenhuma migração foi
  aplicada no Supabase de staging** e nenhum banco remoto foi acessado.
- Causa (log do Actions; o segredo aparece mascarado como `***`): o Python recusou ler a connection string —
  `ValueError: 'aws-0-us-east-2.pooler.supabase.com' does not appear to be an IPv4 or IPv6 address`. Esse erro
  acontece quando a URL tem **colchetes `[` `]`** antes do host (reproduzido localmente), típico de
  `[YOUR-PASSWORD]` do modelo do Supabase deixado no texto ou da senha colada entre colchetes.
- Correção (LEP): editar o segredo `STAGING_SUPABASE_DB_URL` no ambiente `staging` sem colchetes —
  `postgresql://postgres.<ref-de-teste>:<senha>@aws-0-us-east-2.pooler.supabase.com:5432/postgres`, com caracteres
  especiais da senha percent-encoded (`@`→`%40`, `#`→`%23`, `[`→`%5B`, `]`→`%5D`…). Depois, novo push só de
  comentário.
- Observação: a trava falhou com erro do Python (traceback) em vez da mensagem em pt-BR; o comportamento é seguro
  (recusa), mas a mensagem pode ser melhorada.

### 13.9 Terceira execução (2026-09-29) — ⚠ conexão recusada pelo Supabase, NADA aplicado

- Commit `b9cbce6` (só comentário no workflow), execução nº 4 (id `36517264719`), depois de a LEP tirar os
  colchetes do segredo.
- **Job 1 (banco descartável): ✅ sucesso.** **Job 2:** ✅ trava aprovou (URL legível e diferente da produção);
  ✅ Supabase CLI instalado; ❌ **simulação (`db push --dry-run`) falhou ao conectar**; aplicação e histórico
  **pulados**. **Nenhuma migração foi aplicada no Supabase de staging.**
- Causa (log do Actions): `FATAL: (ENOTFOUND) tenant/user postgres.<ref-do-teste> not found` — o usuário do segredo
  ficou literalmente `postgres.<ref-do-teste>`: o texto de exemplo não foi trocado pelo identificador real do projeto
  de teste, e o pooler do Supabase não encontrou esse projeto.
- Correção (LEP): no segredo `STAGING_SUPABASE_DB_URL`, trocar `<ref-do-teste>` pelo identificador do projeto de
  TESTE (o trecho `xxxx` de `https://xxxx.supabase.co` do projeto de teste). O jeito mais seguro é copiar a connection
  string pronta em Supabase (projeto de TESTE) → Connect → Session pooler e só substituir `[YOUR-PASSWORD]` pela
  senha (sem colchetes). Depois, novo push só de comentário.
- Observação: a trava aceitou um identificador fora do formato do Supabase (com `<` `>`); pode ser endurecida para
  exigir o formato (letras minúsculas/dígitos). A recusa final veio do Supabase, sem efeito em banco algum.

### 13.10 Quarta execução (2026-09-29) — ✅ 13 migrações aplicadas no Supabase de TESTE

- Commit `f1f4cd2` (só comentário no workflow), execução nº 5 (id `36518119909`), depois de a LEP colocar a URL real
  do projeto de teste no segredo. Conclusão do workflow: **success**.
- **Job 1 (banco descartável): ✅** migrações do zero 2x + testes de permissão + cenário de banco parcial.
- **Job 2 (Supabase de TESTE): ✅** trava aprovada (URL diferente da produção) → simulação listou as 13 migrações
  pendentes → `supabase db push --include-all` aplicou as 13, em ordem, de `20260925120000_core_foundation` a
  `20261007120000_alteracoes` ("Finished supabase db push") → `supabase migration list` mostra as 13 com
  Local = Remote. Sem seed.
- Evidência: log do job "Aplicar no Supabase de TESTE" no GitHub Actions. O banco de teste não foi consultado
  diretamente pelo Claude (sem acesso de rede ao PostgreSQL).
- Aviso do Actions (não bloqueia): `supabase/setup-cli@v1` usa Node.js 20, executado em Node.js 24.
- **Próximos passos (§13.3):** 7 — variáveis do Preview na Vercel apontando para o projeto de TESTE (LEP);
  8 — primeiro administrador de teste; 9 — testes das 12 etapas no Preview. Pendente também, conforme o plano,
  a configuração de Auth do projeto de teste (passo 3), se ainda não feita.

### 13.4 Preservação da produção

- Projeto Supabase de produção: nenhum acesso, nenhuma chave nova, nenhuma migração; segredo `SUPABASE_DB_URL` e
  ambiente `production` do GitHub inalterados; **não usar "Run workflow" em "Migrações Supabase (produção)"**.
- Vercel: variáveis de **Production** inalteradas; cron só roda em produção (continua no banco de produção).
- Git: sem merge, sem alteração em `claude/epic-cerf-abwkc1`; o workflow de teste existe só no branch de teste.
- Dados: no teste só dados fictícios ou editais públicos; nada da produção é copiado.

### 13.5 Custos

- Supabase Free: US$ 0 — até 2 projetos ativos gratuitos por organização; projeto parado 1 semana fica pausado
  (reativa pelo painel); limites de 500 MB de banco e 1 GB de Storage. ⚠ Se o novo projeto for criado numa
  organização em plano **pago**, ele gera cobrança de computação: criar numa organização Free. Não usar
  "Branching" do Supabase (é pago).
- Vercel: Preview já faz parte do plano atual (não verificado qual); nada novo é contratado.
- GitHub Actions: uso pequeno de minutos (mesmo tipo de job do CI atual).

---

## 14. Descoberta web de oportunidades audiovisuais (✅ código e testes; 🟡 depende do provedor de busca)

ADR-0024. Implementada em 2026-09-29 no branch `claude/melhorias-editais`. **Não substitui** o monitoramento de
fontes: é uma segunda entrada que usa o mesmo pipeline.

**Fluxo:** busca (`SearchProvider`) → triagem barata do resultado (redes sociais, arquivos, sem termos de edital) →
endereço já conhecido/analisado não é baixado de novo → fonte oficial (agregador/notícia → site da instituição) →
tipo da página (classificador da etapa 6) → **relevância audiovisual pelo OBJETO** (página + regulamento em PDF) →
edital encerrado não entra → `importOpportunity` (o mesmo da varredura: evidências, elegibilidade territorial,
deduplicação/avistamentos, Match v2) com `origin = 'web_discovery'`.

| Parte                                                                                                  | Onde                                                    | Estado                                                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Audiovisual por objeto (tema ≠ objeto), `yes/no/uncertain` com motivo e trecho                         | `packages/modules/funding/src/discovery/audiovisual.ts` | ✅ 16 testes (os 10 casos pedidos + extras) e 8 casos no benchmark |
| Famílias de consultas (termos audiovisuais, favoritas, formato × ação, instituições), limite e rodízio | `discovery/queries.ts`                                  | ✅                                                                 |
| Triagem de resultados e tipo do site (oficial, agregador, notícia)                                     | `discovery/triage.ts`                                   | ✅                                                                 |
| Resolvedor da fonte oficial e nome da instituição                                                      | `discovery/official-source.ts`                          | ✅                                                                 |
| Provedor de busca abstraído + adaptador Brave Search API (opcional)                                    | `apps/web/src/lib/discovery/search-provider.ts`         | ✅ código; **não testado com a API real**                          |
| Orquestração, limites, métricas, fila de incertos                                                      | `apps/web/src/lib/discovery/run.ts`                     | ✅ testada com provedor e sites fictícios                          |
| Pipeline reutilizável (`importOpportunity`)                                                            | `apps/web/src/lib/monitor/run.ts`                       | ✅ testes da varredura inalterados e passando                      |
| Botão "Buscar novas oportunidades", "Para confirmar", "Novas fontes", favoritas ⭐ e filtros           | `editais/fontes`                                        | ✅ conferido com Supabase simulado (desktop e celular)             |
| Origem no painel ("Busca web") e referências no detalhe                                                | `editais`, `editais/[id]`                               | ✅                                                                 |
| Cron `/api/cron/discovery`                                                                             | `apps/web/src/app/api/cron/discovery/route.ts`          | ✅ criado; ⬜ **não agendado** em `vercel.json`                    |

**Banco (migração `20261008120000_descoberta_web`, idempotente):** `edital_sources.is_favorite` e `origin`;
`core.discovery_runs` (métricas por execução); `core.discovery_candidates` (URL descoberta, fonte oficial,
instituição, consulta, trecho, decisão audiovisual com evidência, status, edital). RLS: só administradores leem;
escrita só pelo servidor; administrador só altera `status`/`status_reason`. Teste SQL 014. Aplicada **localmente**
(2x e cenário parcial) e **aplicada no Supabase de TESTE** pelo workflow de staging (execução nº 6, commit
`0f8d5a4`: "Applying migration 20261008120000_descoberta_web.sql… Finished"; histórico com as 14 migrações Local =
Remote). CI do commit `0f8d5a4`: ✅ sucesso. Workflow de produção: ignorado no branch (skipped). **Não aplicada em
produção**.

**O que o usuário final vê:** editais audiovisuais novos em "revisão pendente" (selo "Busca web"). Não audiovisuais,
encerrados e páginas que não são oportunidade ficam só no registro técnico; não há lista pública de descartados.
Administradores veem as execuções, a fila curta "Para confirmar" (importar ou descartar) e "Novas fontes
potencialmente relevantes" (cadastro PAUSADO para testar e ativar).

**Variáveis de ambiente (servidor; nenhuma configurada):** `WEB_SEARCH_PROVIDER` (`brave`), `WEB_SEARCH_API_KEY`
(secreta); opcionais `WEB_DISCOVERY_MAX_QUERIES` (6), `WEB_DISCOVERY_RESULTS_PER_QUERY` (10),
`WEB_DISCOVERY_MAX_CANDIDATES` (8). Sem elas, o botão informa "Provedor de busca não configurado" e nada é buscado.

**Limites e segurança:** até 6 consultas × 10 resultados e 8 páginas analisadas por execução (padrão), ≥1,1 s entre
consultas, 1 nova tentativa só em falha transitória, parada em cota/chave recusada, 50 s por execução; downloads só
por `safeFetch` (anti-SSRF, redirecionamentos revalidados, tamanho e tempo) e respeitando `robots.txt`; chave só no
servidor, em cabeçalho, nunca repassada a outro domínio.

**Pendências / riscos:**

1. **Provedor de busca:** a LEP precisa escolher e contratar (pode ter custo; plano/limites a confirmar). O adaptador
   Brave segue a documentação pública e **não foi validado com a API real** (rede deste ambiente não acessa).
2. Classificação audiovisual por regras: validada com textos fictícios; **não validada com editais reais**. Casos
   reais devem entrar no benchmark (`expected.audiovisual`).
3. Fonte oficial: heurística por links (domínio governamental, texto e endereço do link). Sem link oficial, o edital
   entra com a observação "fonte oficial não localizada"; notícia sem link oficial não entra.
4. Tempo: cada página analisada pode baixar o regulamento em PDF; o limite de 50 s pode cortar a execução (os
   restantes ficam para a próxima).
5. Cron da descoberta **não agendado**; o botão manual funciona assim que o provedor estiver configurado.

### 14.1 Primeiro teste real no staging — preparado, ⬜ AINDA NÃO EXECUTADO (2026-09-29)

**Auditoria do código (commit `02e2a27`):**

- Provedor implementado: só **Brave Search API** (`BraveSearchProvider`). `WEB_SEARCH_PROVIDER` é lido do ambiente do
  servidor, sem diferença de maiúsculas (`brave`); `WEB_SEARCH_API_KEY` precisa ter 8+ caracteres. Outro valor ou
  chave ausente → "Provedor de busca não configurado" e nenhuma busca.
- Chamada: `GET https://api.search.brave.com/res/v1/web/search` com cabeçalho `X-Subscription-Token: <chave>`,
  `Accept: application/json`, parâmetros `q`, `count` (≤20), `offset` (0), `country=BR`, `safesearch=moderate`,
  `text_decorations=false` (o `offset` conta páginas segundo a documentação pública conhecida — **NÃO VERIFICADO**,
  ver §14.2); lê `web.results[].title/url/description/age` e `query.more_results_available`. A chave vai
  só no cabeçalho (nunca na URL nem em log), por `safeFetch` (sem redirecionamentos para a API).
- **Não verificado:** compatibilidade com a documentação ATUAL da Brave e chamada real — a rede deste ambiente
  bloqueia `api.search.brave.com` e o site de documentação da Brave. O formato acima segue a API pública conhecida.
- Ajustes mínimos feitos para o 1º teste: erros 4xx da API (ex.: 422) aparecem com o código HTTP e sem nova tentativa;
  a descoberta não começa outra página nos últimos 15 s do orçamento (grava o histórico e informa o que ficou para a
  próxima); `maxDuration = 60` na página Fontes (Server Actions); item "Descoberta web — provedor de busca" no
  Diagnóstico (só nome e presença da chave). Testes: `pnpm check` ✅ 328; build ✅.

**Variáveis (Vercel → Settings → Environment Variables → ambiente Preview, branch `claude/melhorias-editais`;
NUNCA em Production nem no repositório):**

| Variável                            | Valor no 1º teste | Padrão | Faixa aceita  | Função                                                      |
| ----------------------------------- | ----------------- | ------ | ------------- | ----------------------------------------------------------- |
| `WEB_SEARCH_PROVIDER`               | `brave`           | —      | `brave`       | obrigatória                                                 |
| `WEB_SEARCH_API_KEY`                | chave da Brave    | —      | 8+ caracteres | obrigatória, secreta (marcar como sensível)                 |
| `WEB_DISCOVERY_MAX_QUERIES`         | `5`               | 5      | 1–30          | consultas-base por execução                                 |
| `WEB_DISCOVERY_RESULTS_PER_QUERY`   | `20`              | 20     | 1–20          | resultados por página (máximo da Brave)                     |
| `WEB_DISCOVERY_PAGES_PER_QUERY`     | `1`               | 1      | 1–2           | páginas por consulta (2ª só depois de confirmar o `offset`) |
| `WEB_DISCOVERY_MAX_RAW_RESULTS`     | `100`             | 100    | 1–400         | teto de resultados brutos por execução                      |
| `WEB_SEARCH_MAX_REQUESTS_PER_RUN`   | `10`              | 10     | 1–60          | teto rígido de chamadas à API por execução                  |
| `WEB_SEARCH_MAX_REQUESTS_PER_MONTH` | `300`             | 300    | 1–100000      | teto mensal por organização (contador no banco)             |
| `WEB_DISCOVERY_MAX_CANDIDATES`      | `5`               | 8      | 1–30          | páginas completas baixadas e analisadas por execução        |

Valor fora da faixa volta ao padrão. Fixos no código: 50 s por execução, ≥1,1 s entre chamadas, 1 nova tentativa só
em falha transitória (que também é contada e reservada).

Também precisam estar no Preview (já usadas pelo staging): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e **`SUPABASE_SECRET_KEY` do projeto de TESTE** (a descoberta grava com a chave
de serviço).

**Fora do código (LEP):** criar a conta/assinatura da Brave Search API e gerar a chave (plano, custo e limites a
confirmar no painel da Brave — não verificados daqui); cadastrar as variáveis acima; fazer **Redeploy** do Preview
(variáveis só valem em deploy novo).

**Procedimento do 1º teste:** Preview → Configurações → Diagnóstico (conferir "Descoberta web — provedor de busca" OK
e migrações 20261008120000/20261009120000 OK) → Editais → Fontes (administrador) → **Buscar novas oportunidades** (até
~1 min).

**Resultado esperado:** resumo com Consultas (até 5), Chamadas à API (5 com 1 página por consulta; ≤10), Resultados
(≤100), Descartados na triagem, Páginas analisadas (≤5), Audiovisuais / Não
audiovisuais / Incertos, Fontes oficiais localizadas, Novas oportunidades. Oportunidades audiovisuais abertas entram
em Editais com o selo "Busca web" e "revisão pendente" (filtro "Novos (varredura e busca web)"), com elegibilidade,
evidências e Match; não audiovisuais e encerradas não aparecem no painel; incertas vão para "Para confirmar".
Erros possíveis e significado: "Chave do provedor de busca recusada" (chave errada), "recusou a consulta (HTTP 4xx)"
(parâmetro incompatível — trazer o código para ajuste), "Limite do provedor" (cota), "Tempo da execução esgotado"
(parcial; clicar de novo continua com outras consultas), e os avisos de limite (por execução, mensal, teto de resultados,
falha ao reservar). Resultado real: **a registrar aqui após o teste**.

### 14.2 Estratégia ajustada e proteção de custo (2026-09-29, migração `20261009120000`)

**Busca mais ampla, filtragem antes de baixar:** até 5 consultas-base × 20 resultados (1 página por consulta por
padrão; até 2 permitidas) = até **100 resultados brutos** por execução, em **5 chamadas** à API (teto rígido de 10). A
triagem barata (sem download) agora exige, além de termo de edital, **sinal de produto audiovisual** no título, trecho
ou endereço ("edital cultural" sozinho não passa; "curta/longa duração" e "séries iniciais" não contam), e descarta o
resultado cujo próprio trecho já mostra objeto não audiovisual (ex.: teatro com registro audiovisual). Só os que
passam são baixados (até `WEB_DISCOVERY_MAX_CANDIDATES`), com fonte oficial, classificação da página, decisão
audiovisual pelo objeto (página + regulamento), prazo e o pipeline existente. Uso previsto: manual, 1–2 vezes por
semana; **cron não agendado**.

**Paginação:** 2ª página só se `WEB_DISCOVERY_PAGES_PER_QUERY=2`, se o teto de resultados brutos não foi atingido e se
a resposta anterior trouxe `query.more_results_available = true`. **`offset` NÃO VERIFICADO**: a documentação da Brave
é bloqueada neste ambiente (tentativa em 2026-09-29: `EGRESS_BLOCKED`); o código segue a interpretação pública
conhecida (0 = 1ª página, 1 = 2ª), com comentário. Manter 1 página até a LEP confirmar no painel da Brave.

**Proteção de custo:**

- Por execução: ao chegar a `WEB_SEARCH_MAX_REQUESTS_PER_RUN`, nenhuma chamada nova.
- Mensal: `core.search_api_usage` (organização × mês AAAA-MM no fuso America/Sao_Paulo) e
  `core.reserve_search_request(org, limite)`, que **reserva antes de cada chamada** com uma única instrução
  `INSERT … ON CONFLICT DO UPDATE … WHERE requests < limite RETURNING` (atômica: execuções simultâneas disputam a mesma
  linha; a segunda espera a trava e reavalia o limite com o valor novo). Toda tentativa conta (nova tentativa e
  chamadas com erro). Reserva recusada → não chama; erro na reserva → não chama (falha fechada). Função executável só
  pela chave de serviço; RLS: administradores leem o contador; ninguém grava pela sessão.
- Ao atingir qualquer limite: as buscas param, o que já foi coletado segue para a análise, o histórico registra
  `discovery_runs.limit_reached` (`per_run` | `per_month` | `raw_results` | `reservation_failed`) e
  `discovery_runs.api_requests`; a tela mostra o aviso no resumo, no histórico e o uso do mês ("Chamadas à API de
  busca neste mês: N de 300").

**Commits:** `f47dad9` migração/contador · `e9281ff` busca, triagem e limites · documentação no commit seguinte ·
correção de persistência (título/trecho da Brave só em memória) no commit
`fix(discovery): título e trecho da Brave só em memória` (testes: 337 ✅; build ✅).

**Testes (2026-09-29, local):** `pnpm check` ✅ **337** (core 8, ai 10, projects 3, ingestion 54, funding 175, web 87);
build ✅; SQL ✅ **240** verificações em 15 arquivos (teste 015: reserva até o teto, recusa, teto zero, por
organização, mês válido, só servidor executa, administrador lê, equipe não vê), migrações 2x e cenário parcial ✅.
**Concorrência verificada** em PostgreSQL 16 local com duas sessões simultâneas (a 1ª segurando a transação): com teto
1 e com teto 2 a segunda reserva foi recusada e o contador terminou exatamente no teto.

**Staging:** o push do commit `eabe277` disparou o workflow de staging (execução nº 7): banco descartável ✅, trava ✅,
simulação ✅, aplicação ✅ — histórico do Supabase de TESTE com as **15 migrações** Local = Remote (inclui
`20261009120000`). CI ✅. Workflow de produção: **skipped** (não acionado).

**Candidatos que não couberam na execução:** os que passam na triagem mas ficam além de
`WEB_DISCOVERY_MAX_CANDIDATES` ou do limite de 50 s **não são gravados** — ficam perdidos até aparecerem de novo numa
busca futura (o rodízio de consultas torna isso incerto). Menor mudança proposta (não implementada): gravá-los em
`core.discovery_candidates` com um status novo `queued` (URL, host, tipo de site, consulta) e, na execução seguinte,
analisá-los antes de gastar chamadas novas à API.

**Auditoria de dados (só relatório):**

- (a) O parâmetro `q` vem só de `planDiscoveryQueries`: termos fixos do código (termos audiovisuais, formato × ação,
  instituições), o ano (data de Brasília) e os nomes das fontes marcadas como favoritas (`edital_sources.agency` ou
  `name`, digitados pelo administrador). Nenhum dado de `core.projetos`, valores, orçamentos, membros ou editais entra
  na consulta; os demais parâmetros enviados são fixos (`count`, `offset`, `country`, `safesearch`,
  `text_decorations`).
- (b) **Corrigido em 2026-09-29, antes do 1º teste real: da resposta da Brave só a URL é persistida.**
  - **Usados SÓ EM MEMÓRIA** durante a execução: título (`title`) e descrição (`description` → `snippet`) do
    resultado, para a triagem barata, a decisão audiovisual preliminar e a identificação do candidato. `age` e
    `more_results_available` também não são gravados.
  - **Persistidos a partir da Brave:** `discovery_candidates.url`, `host` e `site_kind` (derivados da URL) e
    `edital_sightings.url` (endereço onde o edital foi encontrado).
  - **Persistidos a partir da página baixada depois por `safeFetch`:** `discovery_candidates.title` (título da página
    de referência; **nulo** se a página não foi baixada ou não tem `<title>`), `official_url`, `official_host`,
    `official_reason`, `institution` e `audiovisual*` (página + regulamento); `edital_sightings.title` (título da
    página baixada correspondente); `editais.title` (título da página baixada; sem `<title>`, o nome derivado do
    endereço/arquivo baixado; por fim, instituição/domínio — **sem fallback para o título da Brave**).
  - **Nunca persistido:** `discovery_candidates.snippet` passa a ser sempre nulo.
  - **Nossos:** `query`, `status*`, datas, `times_seen`, `edital_id`; `discovery_runs` só tem contadores, consultas
    (nossas) e mensagens nossas.
  - Testado: os títulos e trechos do provedor fictício levam marcadores que não aparecem em nenhum dado gravado
    (editais, avistamentos, candidatos, execuções, documentos), enquanto a triagem continua usando-os em memória.
    Nenhum registro real existia antes da correção (o 1º teste real ainda não foi feito). Termos de armazenamento
    da Brave continuam **não verificados** daqui.

---

## 15. Fechamento da versão atual (2026-09-30) — ✅ implementado no branch; aguardando revisão humana

Branch `claude/melhorias-editais`. **Nenhuma migração, nenhuma alteração de banco, nenhum merge, nada em produção.**

**Implementado**

- **Navegação:** menu lateral com hamburger (desktop recolhível com preferência local; drawer no celular/tablet que
  fecha ao navegar e com Esc). Configuração única em `apps/web/src/lib/navigation.ts` (rótulo, rota, ícone,
  permissão, status, seção, ordem): Início, Editais, Produções, Produções Atuais, Equipe Audiovisual, Membros e,
  separado no fim, Diagnóstico (só ADM; a rota continua protegida por `requireMembership("admin")`).
  Identidade do membro: avatar (iniciais) + nome, sem e-mail; menu com "Minha conta" e "Sair".
- **Home:** "Olá, {primeiro nome}", título com "audiovisual." destacado, atalhos (Editais, Produções, Produções
  Atuais, Orçamentos — os dois últimos "Em desenvolvimento"), Visão Geral só com números reais (editais ativos,
  novos para revisar, produções cadastradas), link "Acessar site da LEP Filmes ↗" (nova aba, `noopener`). Removido
  "Seu acesso: Administrador".
- **Editais:** "Fontes monitoradas" → "Buscar Editais"; blocos de triagem/elegibilidade/situação saíram só da
  interface (motor, dados e filtros por URL preservados); cada edital tem "Acessar edital ↗" (URL oficial, só
  http/https, nova aba) e "Ver análise"; cartões no celular.
- **Buscar Editais:** "Fontes Cadastradas" (antigo "Verificar agora") e "Buscar na Web" (descoberta Brave existente,
  não reescrita) lado a lado; após executar, a página continua em Buscar Editais e mostra os editais encontrados
  (título, instituição, prazo, aderência, situação, origem, Novo/Já cadastrado, ações) com o resumo técnico
  recolhido. Nova Fonte mantida. Catálogo: "Acessar fonte ↗" / "Cadastrar fonte" por item, checagem de duplicidade
  (www/barra final/fragmento) antes de cadastrar (também em Nova Fonte, catálogo e fontes descobertas). Histórico
  de varreduras, buscas na web anteriores e páginas ignoradas recolhíveis.
- **Produções:** "Projetos" → "Produções" só na interface ("Cadastrar Produção"); rota `/projetos`, tabela
  `core.projetos` e API inalteradas. Planta das 10 áreas e do ciclo de vida.
- **Plantas (sem dados, sem tabela):** `/producoes-atuais`, `/orcamentos`, `/equipe-audiovisual` (perfil de
  demonstração "Giuliano — Assistente de Platô", avatar provisório, nenhum outro dado). Vocabulário em
  `apps/web/src/lib/blueprints.ts`.
- **Membros:** todos os perfis consultam (quem não é ADM vê só vínculos ativos); convite/reenvio/suspensão/
  reativação só ADM (tela e Server Actions). Lista: foto (iniciais — não há armazenamento de fotos; nada foi
  criado), nome, e-mail, selo ADM/Diretoria/Equipe. Bloco "Proponente" saiu só da tela (dados, tabela,
  `updateProponent` e motor de elegibilidade preservados).
- **Permissões:** `can(role, permissão)` em `packages/core/src/auth/permissions.ts` como ponto único
  (`members.read`, `diagnostics.view`, `editais.search`); comentário prevê permissões granulares futuras.
  `ROLE_LABELS.admin` = "ADM".

**Permissões por perfil**

| Perfil    | Papel    | Acesso                                                                       |
| --------- | -------- | ---------------------------------------------------------------------------- |
| ADM       | `admin`  | Tudo, incluindo Diagnóstico, buscas de editais, fontes e gestão de membros   |
| Diretoria | `editor` | Geral; cadastra/revisa editais e produções; sem Diagnóstico, buscas e gestão |
| Equipe    | `viewer` | Geral de consulta; sem Diagnóstico, buscas e gestão                          |

**Testes executados (resultados reais, 2026-09-30)**

- `pnpm check` (formatação + lint + tipos + testes): ✅ saída 0 — web 97 testes (19 arquivos), funding 175,
  ingestion 54, ai 10, projects 3, core 9.
- `pnpm build`: ✅ saída 0; rotas novas `/producoes-atuais`, `/orcamentos`, `/equipe-audiovisual`.
- Navegador (Playwright + Supabase simulado, dados fictícios) em 1360/820/390 px: Início, Editais, Buscar Editais,
  Produções, Produções Atuais, Orçamentos, Equipe Audiovisual, Membros, Diagnóstico — todas 200 e **sem rolagem
  horizontal**. Diretoria e Equipe: Diagnóstico some do menu e o acesso direto à rota redireciona para
  `/sem-acesso?motivo=permissao`; sem botões de busca nem de gestão de membros. ADM: "Verificar fontes
  cadastradas" e "Buscar na web" permanecem em `/editais/fontes` e exibem o resultado na tela (no simulado, sem
  chave de serviço, o resultado é a mensagem de erro de configuração).
- **Não verificado:** execução bem-sucedida de busca com editais reais listados na tela (exige chave de serviço e
  sites reais — testar no Preview/staging); testes SQL (`pnpm db:test`) não reexecutados (sem mudança de banco).

**Pendências deliberadas:** módulos Produções Atuais, Orçamentos e Equipe Audiovisual são só plantas; foto de
membro sem armazenamento (iniciais); sede da proponente não é mais editável pela tela (continua no banco e no motor;
reexpor em Configurações quando necessário); busca restrita a ADM (usa chave de serviço e tem custo); permissões
granulares não implementadas.

**Riscos para produção:** as 10 migrações anteriores deste branch continuam pendentes do workflow (§10 item 5);
o resultado da busca na tela depende de `discovered_at`/`edital_sightings.last_seen_at` (limite de 40 itens);
`maxDuration = 60` na página de busca (mesmo limite anterior).

---

## 16. Criação direta de membros, Minha conta e foto de perfil (2026-09-30) — ✅ no branch; aguardando revisão

Branch `claude/melhorias-editais`. **Sem merge, nada em produção, nenhum usuário criado por código/migração/seed.**

**Implementado**

- **Membros → Criar acesso (só ADM):** nome, e-mail, perfil (ADM/Diretoria/Equipe), senha inicial, foto opcional.
  Servidor: `requireMembership("admin")` → chave de serviço → `auth.admin.createUser` (e-mail confirmado) → vínculo
  **ativo** no `org_id` do ADM; se o vínculo falhar, a conta é desfeita. E-mail já existente: nada é criado nem
  alterado. Convite por e-mail mantido, recolhido ("exige SMTP").
- **Membros → Editar nome e foto (só ADM):** para completar cadastros existentes (ex.: o ADM atual) sem mexer em
  Auth, vínculo ou papel; confere que o membro é da organização do ADM.
- **Minha conta (`/conta`):** nome, foto e senha da própria pessoa; perfil de acesso só exibido. `/conta/senha`
  (destino dos convites) continua funcionando. Menu "Minha conta" aponta para `/conta`.
- **Home:** "Olá, {primeiro nome}"; sem nome cadastrado: "Olá!" + link para cadastrar o nome em Minha conta.
- **Menu lateral:** foto (URL assinada) e nome; sem foto, iniciais; e-mail não aparece.
- **Diagnóstico:** nova checagem "Foto de perfil dos membros" (migração `20261010120000`).
- Tolerância: antes da migração, sessão e Membros continuam funcionando (só sem foto); salvar foto mostra aviso.

**Banco (migração `20261010120000_avatares.sql`, idempotente):** `core.profiles.avatar_path` (CHECK: caminho na
pasta do próprio usuário); `grant update (full_name, avatar_path)`; bucket privado `avatars` (2 MB,
JPEG/PNG/WebP); função `core.shares_org_with`; políticas de Storage (ler: própria pessoa e mesma organização;
gravar/alterar/apagar: só a própria pasta). Teste `supabase/tests/016_avatares_rls.sql`.

**Segurança (verificado):** senha só no Supabase Auth (teste unitário confere que nenhuma escrita em tabela e
nenhum log contém a senha; no navegador, nenhuma tabela simulada nem o log do Next contém as senhas usadas);
chave de serviço só em módulos `server-only` — o nome e o valor da chave não aparecem em `.next/static`;
criação/edição por Diretoria ou Equipe é barrada antes de criar o cliente admin (teste unitário) e a tela não
mostra os formulários; foto validada por tipo real e tamanho no servidor e no bucket; Minha conta usa o id da
sessão + RLS (membro não altera perfil nem papel de outra pessoa — teste SQL).

**Testes executados (2026-09-30, resultados reais)**

- `pnpm check`: ✅ saída 0 — web 115 testes (novos: criação direta, bloqueio de não-ADM, regras da foto, sessão
  com nome/foto e fallback 42703), funding 175, ingestion 54, ai 10, projects 3, core 9.
- `pnpm build`: ✅ saída 0 (rotas `/conta` e `/conta/senha`).
- `DB_TEST_SHIM=1 pnpm db:test` (PostgreSQL 16 local, migrações aplicadas 2x): ✅ 16/16 arquivos, incluindo
  `016_avatares_rls.sql` (13 verificações). Cenário `remoto-parcial`: ✅.
- Navegador (Playwright + Supabase **simulado**, dados fictícios): 27/27 verificações — ADM cria acesso com
  foto; e-mail repetido recusado; arquivo não-imagem e foto > 2 MB recusados; ADM edita nome/foto (foto antiga
  removida); Minha conta do ADM altera nome/foto; Home "Olá, {primeiro nome}"; menu com nome e foto, sem e-mail;
  membro criado entra pela tela de login (senha errada não entra); Diretoria sem Diagnóstico (menu e rota) e sem
  criação/edição de membros; membro edita o próprio nome e foto; troca de senha continua funcionando; fallback
  "Olá!" sem nome.
- **Não verificado:** Supabase Auth/Storage **reais** (sem Docker/Supabase local aqui) — testar no Preview/staging
  após aplicar a migração.

**Configuração manual necessária:** aplicar `20261010120000` pelo workflow de migrações (staging e depois
produção); `SUPABASE_SECRET_KEY` já é exigida no servidor (Vercel) — sem ela a criação direta mostra aviso;
nenhuma mudança de SMTP. Depois, completar nome/foto do ADM atual em Minha conta e cadastrar pela tela as
pessoas previstas pela LEP.

---

## 17. Fechamento da V1 para apresentação (2026-09-30) — ✅ no branch; aguardando revisão humana

**Branch:** `claude/melhorias-editais` (repositório `giuliano-prog/LEP-agente-editais`, conferidos antes de começar).
**Objetivo:** apresentar a plataforma como V1 funcional — sem textos de "planta", "em desenvolvimento", "fluxo
futuro" — sem inventar funcionalidades e preservando o motor de Editais.
**Confirmação:** nenhum merge, nenhuma alteração na branch de produção, nenhum deploy/promoção para Production,
nenhuma alteração no Supabase de produção, nenhuma migração, nenhum seed.
Obs.: o pedido citou `STATUS_PROJETO_LEP.md`; o arquivo oficial do projeto (CLAUDE.md) é este
`docs/STATUS-PLATAFORMA-LEP.md` — atualizado aqui para não criar um documento duplicado.

**Implementado por módulo**

- **Home:** 5 cards sempre visíveis — Editais Ativos e Novos Editais para Revisar (dados reais; regra única em
  `lib/editais/metrics.ts`), Produções Atuais, Equipe Audiovisual e Orçamentos Ativos (**0**: ainda sem cadastro no
  banco; os exemplos das telas nunca entram na conta). Atalho "Produções Concluídas"; link do site LEP no final;
  removidos "Em desenvolvimento" e o texto sobre contagens futuras.
- **Navegação:** "Produções" → "Produções Concluídas" (rota `/projetos` e tabela `core.projetos` inalteradas);
  status dos itens passou de "blueprint" para "demo".
- **Editais:** indicadores Editais Ativos, Para Revisar e Próximos do Prazo (até 15 dias), com dados reais;
  "Buscar Editais" mantido; "+ Novo edital" → **Analisar Edital**. Filtros, Match, elegibilidade, territorialidade,
  fontes, descoberta e extração inalterados.
- **Analisar Edital (`/editais/analisar`, Diretoria/ADM):** o navegador envia o PDF ao bucket privado
  (mesmo caminho do cadastro); `analyzeEditalUpload` lê o texto (`extractPdfText`), roda `extractFields`,
  `assessEligibility`, `matchProjects`/`summarizeAdherence`, `findDuplicate` e o novo `extractHighlights`
  (`@lep/funding`, trechos LITERAIS: título, instituição, objeto, quem pode participar, requisitos, documentação)
  e **apaga o PDF do Storage** — nada é cadastrado. A tela mostra resumo (objeto), informações principais,
  participação, requisitos, documentação, territorialidade, pontos de atenção, aderência e produções compatíveis,
  com "Trecho do documento" (origem) em cada informação. **Adicionar aos Editais** reenvia o arquivo e usa o fluxo
  existente `createEditalFromUpload` (agora aceita o título identificado) → revisão do edital. Documento já
  cadastrado → "Abrir edital já cadastrado". `/editais/novo` (link/manual) continua acessível.
  Preparação futura "Pergunte sobre este edital": contrato `EditalQuestionAnswerer` + `NoopEditalQuestionAnswerer`
  - `chunkEditalText` (base de RAG) em `packages/ai` — sem fornecedor, sem interface.
- **Buscar Editais:** Fontes Cadastradas e Buscar na Web preservados. Card da fonte: nome, Ativa/Pausada e
  "Acessar fonte ↗"; dados técnicos, erros, pausar/remover/testar e configuração em "Detalhes e configuração".
  Nova Fonte, catálogo e fontes descobertas com os mesmos campos: **Nome / Instituição**, **Página de Listagem de
  Editais** e **Página Principal**. Decisão: não existe coluna para Página Principal e não foi criada migração —
  ela é **derivada** da listagem (raiz do site, `homepageOf`) e exibida só para conferência; filtro de endereço e
  "fonte exclusiva de audiovisual" ficaram em "Opções avançadas".
- **Produções Concluídas (`/projetos`):** cards inteiros clicáveis; "+ Adicionar Produção Concluída" abre
  `/projetos/nova` (formulário existente; após salvar abre a ficha). Toda linha de `core.projetos` aparece como
  "Finalizada" enquanto o banco não tem ciclo de vida.
- **Ficha da produção (`/projetos/[id]` e `/producoes-atuais/[slug]`):** o MESMO componente
  (`components/productions/production-sheet.tsx`): ciclo de vida com a etapa atual destacada e as 10 áreas
  (abas por `?area=`); áreas sem dados mostram estado vazio. Visão Geral com sinopse e dados; **Trailer / Mídia**
  de A Conspiração Condor incorporado via `youtube-nocookie` (+ link externo). A associação título → trailer fica em
  `lib/productions/media.ts` (não há coluna de mídia).
- **Produções Atuais:** cards "Nome da Produção 01 — Em orçamento" e "Nome da Produção 02 — Em produção"
  (demonstrativos, selo "Exemplo"), clicáveis para a ficha; ciclo de vida abaixo. Removidos os textos de
  protótipo e o "Cartão de cada produção (planta)".
- **Orçamentos:** "Nenhum orçamento ativo" + estrutura do orçamento, sem aviso de planta.
- **Equipe Audiovisual:** "+ Cadastrar Profissional" (Diretoria/ADM), busca por nome/função (sem acentos),
  categorias com contagem (Direção … Atrizes e Atores, Pós-produção; lista aberta), "Profissionais cadastrados"
  com Giuliano Carvalho — Assistente de Platô (exemplo; card clicável) e ficha com todos os campos pedidos
  ("Não informado" onde não há dado). Um profissional pode ter várias funções (`otherRoles`). Direção futura
  (sugestão de equipes, nunca escalação automática) registrada em `lib/team/model.ts`.
- **Membros / Minha conta / permissões:** sem alterações.

**Somente demonstrativo (em código, marcado "Exemplo", nunca no Supabase):** `lib/demo/productions.ts`
(Produções Atuais) e `lib/demo/professionals.ts` (Equipe Audiovisual). O formulário "Cadastrar Profissional"
não grava (botão desabilitado, sem Server Action) — ainda não há tabela de profissionais. Orçamentos sem cadastro.

**Banco/migrations:** nenhuma.

**Principais arquivos:** `app/(app)/page.tsx`, `app/(app)/editais/{page,actions}.tsx`,
`app/(app)/editais/analisar/page.tsx`, `components/editais/analyze-edital.tsx`, `lib/editais/{analysis,metrics,links}.ts`,
`packages/modules/funding/src/highlights.ts`, `packages/ai/src/edital-questions.ts`,
`app/(app)/editais/fontes/{page,source-forms}.tsx`, `app/(app)/projetos/{page,actions,[id]/page,nova/page}.tsx`,
`components/productions/production-sheet.tsx`, `lib/productions/{model,media}.ts`,
`app/(app)/producoes-atuais/{page,[slug]/page}.tsx`, `app/(app)/equipe-audiovisual/{page,[slug]/page,novo/page}.tsx`,
`components/team/team-directory.tsx`, `lib/team/model.ts`, `lib/demo/*`, `lib/navigation.ts`,
`app/(app)/orcamentos/page.tsx`. Removidos: `lib/blueprints.ts`, `components/blueprint.tsx`.

**Testes executados (2026-09-30, resultados reais)**

- `pnpm check`: ✅ saída 0 — web 128, funding 181, ingestion 54, ai 12, core 9, projects 3.
- `pnpm build`: ✅ saída 0 (novas rotas: `/editais/analisar`, `/projetos/[id]`, `/projetos/nova`,
  `/producoes-atuais/[slug]`, `/equipe-audiovisual/[slug]`, `/equipe-audiovisual/novo`).
- `DB_TEST_SHIM=1 pnpm db:test` (PostgreSQL 16 local): ✅ 16/16 (sem mudanças de banco).
- Playwright + Supabase **simulado** (dados fictícios; PDF fictício gerado para o teste): ADM 59/59 — Home,
  Editais, Analisar Edital (análise sem cadastro, PDF removido do Storage, Adicionar aos Editais pelo fluxo
  existente), Buscar Editais, Produções Concluídas, ficha com trailer e 10 áreas, Produções Atuais, Equipe
  (busca/categorias/ficha), Membros, Minha conta, Diagnóstico; Diretoria 16/16 e Equipe 16/16 (Diagnóstico
  bloqueado por rota; Analisar Edital, Adicionar Produção e Cadastrar Profissional liberados só para Diretoria/ADM;
  Equipe consulta tudo); sem rolagem horizontal em 820 e 390 px. Regressão de Membros/Minha conta (rodada anterior):
  27/27.
- **Não verificado:** Supabase/Storage reais e o player do YouTube (o ambiente de teste não acessa a internet);
  Vercel Preview (o deploy é da Vercel após o push).

**Pendências / limitações da V1:** ciclo de vida das produções no banco (hoje concluídas = todas as de
`core.projetos`; atuais = exemplos); tabelas de profissionais e orçamentos; coluna de mídia/trailer; Página
Principal persistida (hoje derivada); análise do PDF é determinística (trechos literais) — IA e "Pergunte sobre
este edital" dependem de fornecedor; PDF digitalizado (imagem) não é lido (sem OCR).
