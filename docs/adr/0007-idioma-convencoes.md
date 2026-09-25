# ADR-0007 — Idioma e convenções

**Status:** Aceita (2026-09-25)

## Decisão

- **Interface em português (pt-BR).** Rotas visíveis ao usuário também em português (`/configuracoes/membros`, `/conta/senha`).
- **Código, tabelas, colunas, funções e tipos em inglês** (`memberships`, `org_id`, `hasRole`).
- Comentários e documentação em português (facilita o acompanhamento pela equipe).
- Datas armazenadas como `timestamptz` (UTC) e exibidas no fuso `America/Sao_Paulo`.
- Valores monetários: `numeric` (nunca `float`).
- Formatação automática com Prettier; lint com ESLint; TypeScript em modo estrito.
- Contas de infraestrutura (GitHub, Supabase, Vercel, IA, e-mail) vinculadas à LEP sempre que possível.
