# ADR-0004 — Autenticação por convite

**Status:** Aceita (2026-09-25)

## Decisão

- **Supabase Auth** com **e-mail e senha**.
- **Cadastro público desligado** (`enable_signup = false`). Usuários entram apenas por **convite**
  (script `pnpm members:invite`; tela de administração em etapa futura).
- Convite e redefinição de senha usam links com `token_hash` para `/auth/confirm` (fluxo recomendado
  para renderização no servidor). Templates em `supabase/templates/`.
- Política de senha: mínimo 10 caracteres, com maiúsculas, minúsculas e números.
- Sessão em cookies (`@supabase/ssr`), renovada pelo `src/proxy.ts`.
- Três camadas de proteção:
  1. `proxy.ts` — redireciona não autenticados para `/login` (checagem rápida).
  2. `requireMembership(papel)` — em cada página, valida usuário no servidor de Auth e papel.
  3. **RLS** — o banco só devolve dados permitidos, mesmo que as camadas anteriores falhem.

## Consequências

- Em produção é necessário configurar no painel do Supabase: _Site URL_, _Redirect URLs_,
  templates de e-mail (copiar de `supabase/templates/`), desligar cadastro público e um SMTP próprio
  (o SMTP padrão do Supabase tem limite baixo de envio).
- Login social, MFA e SSO podem ser adicionados depois sem mudar o modelo de dados.
