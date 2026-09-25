# ADR-0003 — Banco: schemas por módulo, org_id e RLS

**Status:** Aceita (2026-09-25)

## Decisão

1. **Um schema PostgreSQL por módulo**: `core` (núcleo), futuramente `projects`, `funding` (captação) etc.
   Cada schema novo precisa ser adicionado a `[api].schemas` em `supabase/config.toml`
   **e**, no Supabase Cloud, em _Project Settings → Data API → Exposed schemas_.
2. **Toda tabela de negócio tem `org_id`** (organização dona do dado), mesmo com a LEP sendo a única organização hoje.
3. **RLS (Row Level Security) obrigatório em todas as tabelas.** A segurança fica no banco, não só na interface.
   As políticas usam `core.has_role(org_id, 'viewer' | 'editor' | 'admin')`.
4. **GRANTs explícitos** por tabela e por coluna (o que o usuário pode alterar). `anon` não acessa `core`.
5. **Migrações versionadas** em `supabase/migrations/` — nunca alterar o banco manualmente em produção.
6. **Auditoria**: a função genérica `core.audit_row_change()` pode ser anexada a qualquer tabela.
7. **Testes de permissão** em SQL (`supabase/tests/`) rodam localmente e no CI.

## Tabelas do núcleo (Etapa 0)

| Tabela               | Função                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `core.organizations` | organizações (tenant)                                               |
| `core.profiles`      | perfil de cada usuário (criado automaticamente no cadastro do Auth) |
| `core.memberships`   | vínculo usuário ↔ organização com papel                             |
| `core.audit_log`     | trilha de auditoria (somente escrita por trigger)                   |
| `core.ai_usage`      | custo e consumo de cada chamada de IA                               |

## Consequências

- Proteções embutidas: a organização nunca fica sem administrador (trigger), admin não move membros entre organizações.
- Novas tabelas devem seguir o checklist de `docs/arquitetura.md`.
