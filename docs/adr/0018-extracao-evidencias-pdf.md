# ADR-0018 — Extração com evidência por campo e texto de PDF

**Status:** Aceita (2026-09-28)

## Contexto

Prazo, valores e regras de muitos editais só estão no regulamento em PDF, que a varredura não lia. As sugestões não
mostravam de onde vinham, o que dificultava a revisão.

## Decisão

- **Biblioteca:** `pdfjs-dist` (Mozilla), a mais madura para texto de PDF em JavaScript/TypeScript, na build
  "legacy" para Node, com o worker no mesmo processo e `serverExternalPackages` no Next.js. **Sem OCR**: PDFs
  digitalizados são sinalizados para conferência manual. Limites de páginas, caracteres e tempo; XFA, WebAssembly e
  fontes do sistema desligados.
- **Extração determinística** (`extractFields`): cada campo tem valor, trecho e origem (`page`/`pdf`). O PDF do
  regulamento prevalece sobre a página; divergências são registradas em `extraction_notes`. Nada é inventado: sem
  evidência, o campo fica vazio.
- **Persistência:** `core.editais.field_evidence` (jsonb, objeto, até 64 KB), `extraction_notes`, `extracted_at`
  (migração `20261004120000_evidencias`). Valores continuam sendo sugestões pendentes de revisão (ADR-0009).
- A varredura segue o link do regulamento (PDF) da página do edital e o guarda como anexo (`metadata.role =
"regulation"`), preservando a fonte da evidência.

## Consequências

- Uma dependência nova (`pdfjs-dist`) em `@lep/ingestion`; atualizações de segurança devem ser acompanhadas.
- OCR fica fora do escopo; se necessário no futuro, entra como etapa própria com decisão sobre fornecedor.
