# ADR-0020 — Aderência explicável e Match v2 persistido

**Status:** Aceita (2026-09-28)

## Contexto

O Match v1 classificava cada projeto em compatível / com pendências / incompatível. Qualquer campo não registrado
no edital virava pendência, e a aderência não mostrava _por que_ era alta ou baixa, nem quanto do edital era
conhecido. O resultado também não ficava gravado para outros módulos.

## Decisão

- Mantém os marcadores ✓ / ⚠ / ✕ (diretriz nº 3) e o `MATCH_DISCLAIMER`.
- **Fatores com peso** (formato 25, estágio 20, orçamento 20, prazo 20, gênero 15): atende (100%), parcial (50%,
  ex.: prazo em ≤ 7 dias), não atende (0) ou **sem dado** (excluído da conta). Pontuação = pontos ÷ peso avaliado.
- **Confiança** = peso avaliado ÷ peso total. Abaixo de 40% → "Dados insuficientes" (incerteza nunca vira "Baixa").
- **Impedimentos**: elegibilidade restrita (pessoa física, não elegível, via parceiro, restrição sem território
  registrado), território incompatível, prazo encerrado → nível "Baixa", com o motivo.
- **Persistência** em `core.edital_matches` (um registro por edital × projeto; versão `v2`; fatores; impedimentos;
  `inputs_hash` SHA-256 dos dados usados), com RLS (Equipe lê; Diretoria/Admin gravam) e auditoria. A tela sempre
  calcula ao vivo; o registro gravado indica se está em dia.

## Consequências

- Pesos e limiares são regras de negócio: mudanças devem atualizar este ADR, `docs/diretrizes-lep.md` e os testes.
- Novas versões das regras incrementam `MATCH_VERSION` (o hash muda e o cálculo aparece como desatualizado).
