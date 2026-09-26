# Registros de Decisão de Arquitetura (ADR)

Cada decisão técnica relevante vira um arquivo curto: **contexto → decisão → consequências**.
Decisões não são apagadas; quando mudam, um novo ADR "substitui" o anterior.

| #    | Decisão                                                                         | Status |
| ---- | ------------------------------------------------------------------------------- | ------ |
| 0001 | [Monólito modular em monorepo pnpm](0001-monolito-modular.md)                   | Aceita |
| 0002 | [Next.js + Supabase + Vercel; worker adiado](0002-stack-hospedagem.md)          | Aceita |
| 0003 | [Banco: schemas por módulo, org_id e RLS](0003-banco-schemas-org-id-rls.md)     | Aceita |
| 0004 | [Autenticação por convite](0004-autenticacao.md)                                | Aceita |
| 0005 | [Papéis e permissões](0005-papeis-permissoes.md)                                | Aceita |
| 0006 | [IA desacoplada do fornecedor e registro de custos](0006-ia-desacoplada.md)     | Aceita |
| 0007 | [Idioma e convenções](0007-idioma-convencoes.md)                                | Aceita |
| 0008 | [Sem Python inicialmente](0008-sem-python.md)                                   | Aceita |
| 0009 | [Revisão humana, histórico e sites com login](0009-revisao-humana-historico.md) | Aceita |
| 0010 | [Tabelas `core.editais` e `core.projetos`](0010-tabelas-editais-projetos.md)    | Aceita |
| 0011 | [Cadastro de editais por URL/PDF](0011-cadastro-editais-url-pdf.md)             | Aceita |
| 0012 | [Monitoramento automático de fontes](0012-monitoramento-automatico.md)          | Aceita |

Modelo para novos ADRs: copie um existente e mantenha as seções.
