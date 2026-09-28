# ADR-0021 — Detecção de alterações e retificações

**Status:** Aceita (2026-09-28)

## Contexto

Editais mudam depois de publicados (prorrogação, errata, retificação de valores). A plataforma só olhava cada link
uma vez, então as mudanças passavam despercebidas.

## Decisão

- **Re-verificação periódica** pela varredura: até 2 editais abertos por fonte por execução, com intervalo mínimo
  de 20 h, respeitando robots.txt e o orçamento de tempo. Também manual ("Verificar alterações agora").
- **Linha de base** = SHA-256 do texto da página (`editais.content_hash`), gravada na importação. Hash igual →
  nada a fazer. Primeira verificação sem linha de base só a registra (não trata edições da equipe como alteração).
- **Retificações**: links com retificação/errata/aditivo/republicação/prorrogação na página → documento
  `rectification`. Regulamento com hash novo → nova versão (`annex`, `role = regulation`). Página alterada → cópia
  (`other`, `role = page_version`) como evidência.
- **Comparação** (`diffFields`): só campos com valor NOVO encontrado e diferente do atual (campo que "sumiu" não
  conta). Registro em `core.edital_changes` com status `pending`.
- **Nunca sobrescreve**: aplicar os valores novos é decisão da Diretoria/Admin (`changeColumns`), que recalcula o
  Match; ignorar encerra o aviso. Auditoria e `resolved_by/resolved_at` pelo banco.

## Consequências

- Cada execução faz algumas requisições extras por fonte; os limites mantêm a varredura dentro de 60 s.
- Páginas dinâmicas cujo texto muda sempre podem gerar verificações frequentes, mas só geram alerta quando um campo
  extraído muda ou há retificação nova.
