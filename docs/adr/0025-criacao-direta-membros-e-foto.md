# ADR-0025 — Criação direta de membros pelo ADM e foto de perfil

- **Status:** aceito (2026-09-30)
- **Complementa:** ADR-0015 (status do vínculo e convites)

## Contexto

Sem SMTP próprio configurado no Supabase, o convite por e-mail (ADR-0015) não é confiável. A LEP precisa
cadastrar as pessoas reais agora e identificá-las com nome e foto (Home, menu, Membros).

## Decisão

- **Criação direta (ADM):** em Membros, o ADM informa nome, e-mail, perfil, **senha inicial** e foto opcional.
  A Server Action exige `requireMembership("admin")` e só então usa a chave de serviço:
  `auth.admin.createUser` (e-mail já confirmado) + vínculo **ativo** no `org_id` desse ADM
  (`apps/web/src/lib/members/create.ts`). Se o vínculo falhar, a conta criada é desfeita.
- **Senha:** existe só durante a requisição e vai direto para o Supabase Auth. Não é gravada em tabela própria,
  não volta para a tela, não entra em log, código, migração ou seed. Conta já existente com o mesmo e-mail
  **não** é alterada (nenhuma senha é trocada). A pessoa troca a senha em Minha conta.
  Isto ajusta a regra "nunca pedir senha" do ADR-0015 **somente** para a senha inicial definida pelo ADM.
- **Foto:** coluna `core.profiles.avatar_path` + bucket **privado** `avatars` (2 MB; JPEG/PNG/WebP), migração
  `20261010120000_avatares.sql`. Caminho sempre `<user_id>/...` (CHECK no banco). A tela usa URLs assinadas.
  Tipo real conferido pelo conteúdo do arquivo (assinatura), não pelo nome.
  - Leitura: a própria pessoa e membros de uma organização em comum (`core.shares_org_with`).
  - Escrita pela sessão: só na própria pasta (Minha conta). O ADM grava nome/foto de outro membro pelo servidor,
    depois de conferir papel e que o membro é da sua organização.
- **Minha conta (`/conta`):** nome, foto e senha da própria pessoa (id vem da sessão; RLS `profiles_update_self`).
  O perfil de acesso (papel) só é exibido.
- O convite por e-mail continua disponível (recolhido em Membros) para quando houver SMTP.

## Consequências

- Uso da chave de serviço passa a incluir criação de acesso e edição de nome/foto pelo ADM.
- Server Actions aceitam corpo de até 3 MB (`next.config.ts`) por causa da foto.
- Produção precisa da migração `20261010120000` (pelo workflow). Sem ela, nome continua funcionando e a foto
  mostra mensagem de migração pendente (Diagnóstico acusa).
