# ADR-0019 — Deduplicação multi-fonte e avistamentos

**Status:** Aceita (2026-09-28)

## Contexto

O mesmo edital aparece no site do órgão, em agregadores e em notícias. A deduplicação só comparava link e hash,
então cada fonte gerava um edital novo.

## Decisão

- Impressão digital determinística: número/ano do edital (título ou texto), palavras significativas do título e prazo.
- Regras: mesmo número + títulos parecidos (≥ 30%) → **mesmo**; título quase igual (≥ 80%) + mesmo prazo →
  **mesmo**; números ou prazos diferentes → **diferentes**; títulos parecidos (≥ 60%) sem confirmação → **possível**.
- "Mesmo" na varredura → `core.edital_sightings` (fonte, endereço, motivo; único por edital+endereço); o endereço
  passa a ser conhecido e não é baixado de novo.
- "Possível" → `editais.possible_duplicate_of` + motivo; a equipe decide. No cadastro manual nunca há mescla
  automática, só o aviso.
- `edital_sightings.edital_id` usa o tipo de `core.editais.id` (uuid local; pode ser bigint no remoto).

## Consequências

- Limiares ajustáveis com casos reais do benchmark (dependente da planilha de 38 oportunidades).
- A mescla de dados entre editais duplicados continua manual (descartar o duplicado com motivo).
