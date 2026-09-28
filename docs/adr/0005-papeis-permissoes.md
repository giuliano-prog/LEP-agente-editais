# ADR-0005 — Papéis e permissões

**Status:** Aceita (2026-09-25)

## Decisão

Três papéis hierárquicos, por organização:

| Papel (código) | Nome na interface | Pode                                              |
| -------------- | ----------------- | ------------------------------------------------- |
| `viewer`       | Equipe            | ler conteúdo                                      |
| `editor`       | Diretoria         | ler, criar, editar e **revisar/validar**          |
| `admin`        | Administrador     | tudo, inclusive membros, custos de IA e auditoria |

- No banco: enum `core.app_role` (a ordem define a hierarquia) + funções `core.role_in_org` e `core.has_role`.
- No código: `packages/core/src/auth` — `ROLES`, `hasRole()`, `can(role, permissão)`.
  Um teste de tipos garante que enum do banco e código são iguais.
- Permissões nomeadas (`content.edit`, `members.manage`…) decidem o que a interface mostra;
  **a garantia real é o RLS**.

Rótulos atualizados em 2026-09-28 (ADR-0015): Equipe, Diretoria, Administrador. Só vínculos com
`status = 'active'` contam para `role_in_org`/`has_role`.

## Consequências

- Se no futuro "editor" e "revisor" precisarem ser separados, adiciona-se um valor ao enum e ao mapa de permissões.
