# ADR-0006 — IA desacoplada do fornecedor e registro de custos

**Status:** Aceita (2026-09-25)

## Contexto

O fornecedor de IA ainda não foi escolhido e pode mudar. Os custos precisam ser acompanhados desde o início.

## Decisão

- Pacote `@lep/ai` define o contrato `AiProvider` (`complete(request)`). **Nenhum módulo importa SDK de fornecedor diretamente.**
- Cada implementação (ex.: Anthropic, OpenAI) será um adaptador em `packages/ai/src/providers/`, criado quando o primeiro módulo usar IA.
- Os módulos pedem um modelo **lógico** (ex.: `fast`, `capable`); o mapeamento para o modelo real fica em configuração.
- `withUsageTracking()` envolve qualquer provedor e registra **toda** chamada (sucesso ou erro) em `core.ai_usage`:
  finalidade, fornecedor, modelo, tokens, custo estimado (USD), duração.
- Sem teto de custo por enquanto; a tabela permite criar limites e alertas depois.

## Consequências

- Trocar de fornecedor = escrever um adaptador novo, sem mexer nos módulos.
- Dados sigilosos enviados à IA deverão ser minimizados (decisão a registrar quando o fornecedor for escolhido).
