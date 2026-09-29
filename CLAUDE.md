# Plataforma LEP — guia para agentes

Monorepo pnpm (Node 22). Leia `docs/arquitetura.md` e `docs/adr/` antes de mudanças estruturais.

## Comandos

- `pnpm check` — formatação + lint + tipos + testes (rode antes de commitar)
- `pnpm build` — build de produção
- `DB_TEST_SHIM=1 DB_URL=... pnpm db:test` — testes de RLS em Postgres puro; `pnpm db:test` usa o Supabase local

## Diretrizes de negócio da LEP (obrigatórias — `docs/diretrizes-lep.md`)

1. **Território:** LEP sediada em São Paulo/SP. Aceitar editais federais/nacionais, de SP (estado e capital) e de
   outros locais que aceitem proponentes de SP; os exclusivos de outros territórios ficam visíveis como
   “restrição territorial”, com motivo e trecho (`assessEligibility` em `packages/modules/funding/src/eligibility.ts`;
   na dúvida, “não confirmada” — nunca “não elegível” sem decisão humana; nada é descartado automaticamente).
   Situação, triagem e elegibilidade são eixos separados (ADR-0016).
2. **Foco exclusivo na LEP:** a proponente é sempre a própria LEP; parceiras/coprodutoras não contam para elegibilidade.
3. **Tabela de Editais:** colunas Oportunidade | Instituição | Prazo | Valor | Aderência (Match); painel de Match com ✓ / ⚠ / ✕.

## Convenções

- Interface em pt-BR; código, tabelas e colunas em inglês; comentários/docs em pt-BR.
- Toda tabela de negócio: `org_id`, RLS com `core.has_role`, grants explícitos, teste em `supabase/tests/`.
- Nunca editar migração já aplicada: crie uma nova. **Migrações devem ser idempotentes** (`if not exists`,
  `create or replace`, `drop ... if exists` + `create`): o CI as aplica 2x e sobre banco parcial (ADR-0014).
- Produção recebe migrações só pelo workflow `supabase-migrations.yml` (nunca pelo SQL Editor; seed nunca em produção).
- Papéis: `viewer < editor < admin` — manter `core.app_role` e `packages/core/src/auth/roles.ts` iguais.
- Não importar SDKs de IA fora de `packages/ai` (ADR-0006).
- Next.js 16: `src/proxy.ts` (não `middleware.ts`); `cookies()`/`searchParams` são assíncronos.
- Tabelas `core.editais`/`core.projetos` (ADR-0010). Vocabulário de projetos em `packages/modules/projects/src/vocabulary.ts` = CHECK constraints da migração.
- Match (`packages/modules/funding`): regras determinísticas; nunca afirmar aprovação (`MATCH_DISCLAIMER`).
- Documentos de editais: bucket privado `edital-documents` (`<org_id>/...`), `core.edital_documents` com SHA-256 imutável (ADR-0011). Buscar URLs externas só via `safeFetch` de `@lep/ingestion` (anti-SSRF).
- Varredura (ADR-0012): `lib/monitor/run.ts` com cliente admin (`lib/supabase/admin.ts`) — uso restrito a varredura/cron/diagnóstico e convites de membros (ADR-0015, só após `requireMembership("admin")`), sempre filtrando `org_id`. Importados entram com revisão pendente.
- Membros (ADR-0015): só `memberships.status = 'active'` dá acesso; perfis Administrador/Diretoria/Equipe = admin/editor/viewer. Nunca pedir nem guardar senhas.
- Erros do banco na UI: use `DbErrorNotice` (causa + correção), nunca mensagem genérica.
- Tema: use tokens de `globals.css` (`bg-surface`, `bg-card`, `text-fg`, `text-muted`, `text-brand`), nunca cores soltas.
- Dados da LEP são sigilosos: nada de dados reais em seeds, fixtures ou logs.

## Registro de estado (obrigatório)

- Ao final de **toda tarefa que altere o projeto**, atualize `docs/STATUS-PLATAFORMA-LEP.md`: o que foi implementado,
  testes executados e resultados reais, commits relevantes, pendências e riscos, e estado do Git (branch, commit de
  referência, alterações não commitadas). Faça commit junto com a tarefa.
- Nunca invente informação: registre só o que foi verificado; o que não pôde ser verificado fica marcado como tal.
