# ADR-0001 — Monólito modular em monorepo pnpm

**Status:** Aceita (2026-09-25)

## Contexto

A LEP começa pelo módulo de Captação de Recursos, mas pretende adicionar Projetos, Contratos,
Orçamentos, Prestação de Contas etc. A equipe é pequena e as prioridades são simplicidade,
baixo custo e manutenção fácil.

## Decisão

- Uma única aplicação (monólito) organizada em **módulos com fronteiras claras**, sem microsserviços.
- Monorepo com **pnpm workspaces**:
  - `apps/web` — Next.js (interface + ações de servidor).
  - `apps/worker` — (futuro) processos longos: coleta, extração, alertas.
  - `packages/core` — núcleo compartilhado (papéis, permissões, utilidades de domínio).
  - `packages/db` — tipos do banco.
  - `packages/ai` — contrato de IA independente de fornecedor.
  - `packages/modules/<modulo>` — (futuro) domínio de cada módulo.
- Um módulo **não acessa tabelas internas de outro**; usa funções públicas do outro módulo.

## Consequências

- Um deploy, um banco, um repositório: simples de operar.
- Módulos podem ser extraídos para serviços no futuro se houver necessidade real.
- Exige disciplina nas fronteiras (revisão de código e convenções em `docs/arquitetura.md`).
