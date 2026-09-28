# ADR-0023 — Interface EditalAnalyzer (IA sem fornecedor definido)

**Status:** Aceita (2026-09-28)

## Contexto

A análise de editais por IA pode complementar as regras determinísticas, mas a LEP ainda não escolheu fornecedor e
exige: nenhuma afirmação de aprovação, incerteza nunca virando "não elegível", dados sigilosos protegidos.

## Decisão

- `packages/ai/src/edital-analyzer.ts` define `EditalAnalyzer.analyze(input) → EditalAnalysis` (campos com trecho,
  elegibilidade, resumo neutro, avisos).
- Padrão: `NoopEditalAnalyzer` (`enabled = false`): nada é enviado; a plataforma segue pelas regras.
- `createProviderEditalAnalyzer(provider)` usa qualquer `AiProvider` (ADR-0006), de preferência envolvido por
  `withUsageTracking` (custo em `core.ai_usage`). **Nenhum SDK de fornecedor foi adicionado.**
- `validateAnalysis` vale para toda resposta: valor só com trecho literal existente no texto; campos desconhecidos
  descartados; "não elegível" vira "necessita revisão"; elegibilidade sem trecho verificável vira "não confirmada";
  qualquer afirmação sobre aprovação é removida.
- Só textos do edital são enviados; dados de projetos da LEP não entram na análise.

## Consequências

- Quando a LEP escolher o fornecedor: implementar um `AiProvider` em `packages/ai`, configurar a chave no servidor
  e ligar `getEditalAnalyzer(provider)` onde a extração roda — com testes e revisão das regras acima.
