# Benchmark de editais

Mede o motor **atual** (regras determinísticas de `@lep/funding`) contra casos conferidos por uma pessoa.
Não usa rede, banco nem IA, e **nada daqui é usado pelo código de produção** (fica fora de `src/`).

```bash
pnpm benchmark:editais                        # exemplos + benchmark/private/
pnpm benchmark:editais --cases ~/lep-benchmark  # outra pasta com casos
pnpm benchmark:editais --json benchmark-report.json --min-accuracy 0.8
```

`--min-accuracy` faz o comando falhar se algum campo ficar abaixo do mínimo **ou** houver erro grave.

## Situação

- ✅ Estrutura, formato dos casos, avaliadores do motor atual, relatório e testes.
- ⬜ **Casos reais: dependem da LEP.** A lista das 38 oportunidades (planilha de 26/09/2026) **não está no
  repositório**. Os arquivos em `cases/` são **exemplos fictícios** só para testar o benchmark.

## Onde ficam os casos reais

Dados da LEP são sigilosos. Casos reais ficam em `benchmark/private/` (ignorada pelo Git) ou em uma pasta indicada
por `--cases` / `BENCHMARK_CASES_DIR`. Nunca versionar casos reais.

## Formato (um objeto ou uma lista por arquivo `.json`)

```json
{
  "id": "caso-001",
  "fictitious": false,
  "origin": "planilha 26/09/2026, linha 1",
  "referenceDate": "2026-09-26",
  "input": {
    "title": "Título como aparece na fonte",
    "url": "https://…",
    "agency": "Instituição",
    "audiovisualSource": true,
    "text": "texto da página",
    "pdfText": "texto do regulamento (opcional)"
  },
  "expected": {
    "isOpportunity": true,
    "territory": "eligible | ineligible | unknown",
    "eligibility": "eligible | not_eligible | not_confirmed | territorial_restriction | via_partner | individual | needs_review",
    "deadline": "2026-11-30",
    "totalAmount": 10000000,
    "status": "open | closed | upcoming"
  },
  "notes": "observações da pessoa que conferiu"
}
```

Preencha em `expected` **só o que foi conferido**; campos ausentes não são avaliados. Use `null` quando a pessoa
confirmou que a informação não existe (ex.: edital sem valor divulgado).

## Leitura do relatório

- **acurácia** = acertos ÷ avaliados, por campo.
- **sem avaliador**: o motor ainda não produz aquele campo (ex.: `eligibility` até a etapa 5). Nunca conta como acerto.
- **erro grave** (✕✕): o motor descartaria algo que a pessoa não marcou como inelegível, ou deixaria de fora uma
  oportunidade real. Incerteza nunca pode virar "não elegível".

Novos avaliadores (etapas 5–7) entram em `evaluate.ts` (`EVALUATORS`), sem regras específicas por caso.
