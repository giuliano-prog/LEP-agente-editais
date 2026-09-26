# Diretrizes de negócio da LEP Filmes

Regras definidas pela LEP que o sistema aplica automaticamente. Qualquer mudança nestas
regras deve atualizar este documento, o código indicado e os testes.

## 1. Elegibilidade territorial — sede em São Paulo/SP

A LEP Filmes é uma produtora **sediada em São Paulo/SP**.

| Situação do edital                                                                                                   | Decisão                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Federal / nacional (aberto a todo o país)                                                                            | **Aceitar**                                                               |
| Estadual de São Paulo                                                                                                | **Aceitar**                                                               |
| Municipal de São Paulo (capital)                                                                                     | **Aceitar**                                                               |
| De outro estado/município que **permite** proponentes de SP                                                          | **Aceitar**                                                               |
| Nacional com cotas regionais (ex.: 30% para o Norte)                                                                 | **Aceitar**, com aviso para verificar                                     |
| **Exclusivo** para proponentes sediados em outro estado/município (incluindo outros municípios de SP, ex.: Campinas) | **Rejeitar**                                                              |
| Texto sem informação territorial clara                                                                               | **Aceitar como pendente** — verificação humana, nunca rejeição automática |

**Como o sistema aplica:**

- **Varredura diária:** cada edital encontrado tem o texto analisado
  (`packages/modules/funding/src/territory.ts → assessTerritory`). Se for exclusivo de outro território,
  entra como **descartado automaticamente**, com motivo e trecho do texto como evidência
  (visível em Editais → Descartados; pode ser restaurado se a regra errar).
- **Match / Aderência:** critério “Território (sede da LEP)” compara os territórios aceitos pelo edital
  (`eligible_territories`: `BR`, `SP`, `SP:São Paulo`, `RJ`…) com a sede do proponente.
  Exclusivo de outro território → **não atende** → aderência **Baixa**. Não registrado → ponto de atenção.
- **Cadastro manual:** campo “Território de sede aceito para o proponente” no formulário do edital.
- **Sede:** `core.organizations.hq_state/hq_city` (Membros → Proponente). Padrão: São Paulo/SP.

## 2. Foco exclusivo na LEP Filmes

A proponente é **sempre a própria LEP Filmes**. Empresas parceiras, coprodutoras ou associadas
**não são consideradas** para fins de elegibilidade.

**Como o sistema aplica:**

- O Match avalia apenas a sede e os dados da organização (LEP) e dos projetos da LEP.
- Um edital que exige sede local e só admite outros proponentes via parceria/coprodução com empresa local
  continua **inelegível** para a LEP.

## 3. Tabela e marcadores

- A tabela principal de Editais mantém exatamente as colunas:
  **Oportunidade | Instituição | Prazo | Valor | Aderência (Match)**.
- O painel de Match mantém os marcadores **✓ Requisitos atendidos · ⚠ Pontos de atenção / documentos
  pendentes · ✕ Não atendidos**.
- A aderência indica compatibilidade técnica com critérios registrados — **nunca** previsão de aprovação.

## Regras anteriores que continuam valendo

- Nenhum edital é considerado validado sem revisão humana (ADR-0009).
- Sites que exigem login não são acessados automaticamente; `robots.txt` é respeitado (ADR-0012).
- Dados da LEP são sigilosos.
