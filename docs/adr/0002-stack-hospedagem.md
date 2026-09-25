# ADR-0002 — Next.js + Supabase + Vercel; worker adiado

**Status:** Aceita (2026-09-25)

## Decisão

- **Next.js 16 (App Router) + TypeScript** para a aplicação web.
  - No Next 16, o antigo `middleware.ts` chama-se `proxy.ts`.
  - `next build` não roda mais o lint; o lint roda via `pnpm lint` e no CI.
- **Supabase** (PostgreSQL, Auth, Storage) como backend. Desenvolvimento local com Supabase CLI (Docker).
- **Vercel** para hospedar o app web (contas criadas em nome da LEP).
- **Worker**: a hospedagem dos processos longos será decidida na etapa de monitoramento. Até lá, não existe `apps/worker`.
- **Tailwind CSS 4** para estilos; **Zod** para validação; **Vitest** para testes.

## Consequências

- Infraestrutura definitiva deve ser criada em contas vinculadas à LEP, não a contas pessoais.
- Região do Supabase recomendada: São Paulo (`sa-east-1`), por latência e proximidade dos dados.
