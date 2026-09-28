# Registros de Decisão de Arquitetura (ADR)

Cada decisão técnica relevante vira um arquivo curto: **contexto → decisão → consequências**.
Decisões não são apagadas; quando mudam, um novo ADR "substitui" o anterior.

| #    | Decisão                                                                                        | Status |
| ---- | ---------------------------------------------------------------------------------------------- | ------ |
| 0001 | [Monólito modular em monorepo pnpm](0001-monolito-modular.md)                                  | Aceita |
| 0002 | [Next.js + Supabase + Vercel; worker adiado](0002-stack-hospedagem.md)                         | Aceita |
| 0003 | [Banco: schemas por módulo, org_id e RLS](0003-banco-schemas-org-id-rls.md)                    | Aceita |
| 0004 | [Autenticação por convite](0004-autenticacao.md)                                               | Aceita |
| 0005 | [Papéis e permissões](0005-papeis-permissoes.md)                                               | Aceita |
| 0006 | [IA desacoplada do fornecedor e registro de custos](0006-ia-desacoplada.md)                    | Aceita |
| 0007 | [Idioma e convenções](0007-idioma-convencoes.md)                                               | Aceita |
| 0008 | [Sem Python inicialmente](0008-sem-python.md)                                                  | Aceita |
| 0009 | [Revisão humana, histórico e sites com login](0009-revisao-humana-historico.md)                | Aceita |
| 0010 | [Tabelas `core.editais` e `core.projetos`](0010-tabelas-editais-projetos.md)                   | Aceita |
| 0011 | [Cadastro de editais por URL/PDF](0011-cadastro-editais-url-pdf.md)                            | Aceita |
| 0012 | [Monitoramento automático de fontes](0012-monitoramento-automatico.md)                         | Aceita |
| 0013 | [Diretrizes territoriais e foco exclusivo na LEP](0013-diretrizes-territoriais.md)             | Aceita |
| 0014 | [Migrações idempotentes e aplicação automática](0014-migracoes-automaticas.md)                 | Aceita |
| 0015 | [Status do vínculo e convites pela interface](0015-membros-status-convites.md)                 | Aceita |
| 0016 | [Taxonomia em três eixos e elegibilidade visível](0016-taxonomia-elegibilidade.md)             | Aceita |
| 0017 | [Classificador de páginas e configuração por fonte](0017-classificador-paginas-adaptadores.md) | Aceita |
| 0018 | [Extração com evidência por campo e texto de PDF](0018-extracao-evidencias-pdf.md)             | Aceita |

Modelo para novos ADRs: copie um existente e mantenha as seções.
