# ADR-0015 — Status do vínculo e convites pela interface

**Status:** Aceita (2026-09-28)

## Contexto

Até aqui, membros só eram convidados pelo script `pnpm members:invite`, e todo vínculo dava acesso. A LEP precisa
convidar pela tela, reenviar convites e suspender/reativar acessos, com os perfis Administrador, Diretoria e Equipe.

## Decisão

- **Perfis** (só rótulos; os papéis do banco não mudam): Administrador = `admin`, Diretoria = `editor`,
  Equipe = `viewer` (`ROLE_LABELS` em `packages/core/src/auth/roles.ts`).
- **`core.memberships.status`**: `invited | active | suspended` (migração `20261001120000_membros_status`).
  `core.role_in_org` considera só vínculos **ativos** — logo `has_role` e todo o RLS bloqueiam convidados e suspensos.
- **Regras no banco** (`core.guard_membership_status`): vínculo criado pela API nasce convidado; só a própria pessoa
  aceita o convite (`core.accept_my_invitations`, chamada pelo app quando ela entra); ninguém suspende o próprio
  acesso; convite nunca aceito, se reativado, volta a ser convite; sempre há pelo menos um administrador **ativo**.
  A interface só altera `role` e `status` (grants por coluna).
- **Convite**: ação no servidor que primeiro exige `requireMembership("admin")` e só então usa a chave de serviço
  (`inviteUserByEmail` do Supabase Auth) e grava o vínculo filtrando o `org_id` desse administrador
  (`apps/web/src/lib/members/invite.ts`). Pessoa que já tem conta recebe só o vínculo (acesso no próximo login).
- **Suspender/reativar**: pela sessão do próprio administrador (RLS + regras do banco), sem chave de serviço.
- A plataforma **não pede nem guarda senhas**: a pessoa define a senha no link do Supabase Auth (`/conta/senha`).
- Vínculos anteriores à migração continuam ativos; o script `members:invite` continua funcionando (servidor).

## Consequências

- O uso da chave de serviço passa a incluir convites e reenvios (além de varredura, cron e Diagnóstico).
- O envio de e-mails depende de configuração **manual** no Supabase de produção: SMTP próprio, modelo "Invite user"
  (`supabase/templates/invite.html`) e Site URL/Redirect URLs. Sem SMTP próprio, o Supabase limita o envio.
- Reenvio de convite só funciona enquanto a pessoa não confirmou o e-mail (regra do Supabase Auth).
