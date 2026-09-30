/**
 * Modelo da Produção (V1). Uma produção é UMA entidade: o estado (`stage`) decide
 * onde ela aparece — Produções Atuais (em orçamento, aprovada, em produção) ou
 * Produções Concluídas (finalizada, arquivada). Nada é copiado entre as telas.
 *
 * Hoje o banco (`core.projetos`) ainda não tem o estado do ciclo de vida: tudo o que
 * está em `projetos` é tratado como produção concluída, e Produções Atuais usa dados
 * demonstrativos (`lib/demo/productions.ts`). Quando o ciclo de vida entrar no banco,
 * estes rótulos viram o vocabulário (CHECK constraint) da migração.
 */

export type ProductionStage = "budgeting" | "approved" | "in_production" | "finished" | "archived";

export type LifecycleStep = { key: ProductionStage; label: string; description: string };

/** Ciclo de vida na ordem. */
export const PRODUCTION_LIFECYCLE: LifecycleStep[] = [
  { key: "budgeting", label: "Em orçamento", description: "Orçamento e viabilidade." },
  { key: "approved", label: "Aprovada", description: "Recursos ou decisão de seguir confirmados." },
  { key: "in_production", label: "Em produção", description: "Pré-produção, filmagem e pós." },
  { key: "finished", label: "Finalizada", description: "Entregue; prestação de contas concluída." },
  { key: "archived", label: "Arquivada", description: "Acervo e histórico." },
];

export const STAGE_LABELS = Object.fromEntries(
  PRODUCTION_LIFECYCLE.map((step) => [step.key, step.label]),
) as Record<ProductionStage, string>;

/** Estados de Produções Atuais; os demais ficam em Produções Concluídas. */
export const CURRENT_STAGES: readonly ProductionStage[] = [
  "budgeting",
  "approved",
  "in_production",
];

export function isCurrentStage(stage: ProductionStage): boolean {
  return CURRENT_STAGES.includes(stage);
}

export type ProductionArea = {
  key: string;
  label: string;
  description: string;
  /** Mensagem exibida enquanto a área não tem registros. */
  empty: string;
};

/** Áreas da ficha de uma produção (mesma ficha para atuais e concluídas). */
export const PRODUCTION_AREAS: ProductionArea[] = [
  {
    key: "visao-geral",
    label: "Visão Geral",
    description: "Resumo da produção.",
    empty: "Sem informações adicionais.",
  },
  {
    key: "orcamento",
    label: "Orçamento",
    description: "Orçamento por etapa e rubrica. Todo orçamento pertence a uma produção.",
    empty: "Nenhum orçamento registrado para esta produção.",
  },
  {
    key: "equipe",
    label: "Equipe",
    description: "Profissionais da Equipe Audiovisual, com função e período.",
    empty: "Nenhum profissional vinculado a esta produção.",
  },
  {
    key: "cronograma",
    label: "Cronograma",
    description: "Etapas, diárias e marcos de pré-produção, filmagem e pós.",
    empty: "Nenhuma etapa registrada.",
  },
  {
    key: "fornecedores",
    label: "Fornecedores",
    description: "Locações, equipamentos, serviços e demais fornecedores.",
    empty: "Nenhum fornecedor registrado.",
  },
  {
    key: "documentos",
    label: "Documentos e Arquivos",
    description: "Roteiros, versões, anexos e materiais.",
    empty: "Nenhum documento registrado.",
  },
  {
    key: "contratos",
    label: "Contratos",
    description: "Contratos com equipe, elenco, fornecedores e parceiros.",
    empty: "Nenhum contrato registrado.",
  },
  {
    key: "direitos",
    label: "Direitos e Autorizações",
    description: "Cessões de direitos e autorizações de imagem, música e locação.",
    empty: "Nenhuma autorização registrada.",
  },
  {
    key: "financeiro",
    label: "Financeiro / Prestação de Contas",
    description: "Execução do orçamento, pagamentos e prestação de contas.",
    empty: "Nenhum lançamento registrado.",
  },
  {
    key: "historico",
    label: "Histórico",
    description: "Mudanças de etapa e decisões da produção.",
    empty: "Nenhum evento registrado.",
  },
];

export function productionArea(key: string | undefined | null): ProductionArea {
  return PRODUCTION_AREAS.find((area) => area.key === key) ?? PRODUCTION_AREAS[0]!;
}

/** Blocos do orçamento de uma produção. */
export const BUDGET_SECTIONS: { key: string; label: string; description: string }[] = [
  { key: "development", label: "Desenvolvimento", description: "Roteiro, pesquisa e preparação." },
  { key: "pre", label: "Pré-produção", description: "Equipe, testes, locações e planejamento." },
  {
    key: "shoot",
    label: "Produção / Filmagem",
    description: "Diárias, equipe, elenco e logística.",
  },
  { key: "post", label: "Pós-produção", description: "Montagem, som, cor e finalização." },
  {
    key: "admin",
    label: "Despesas administrativas",
    description: "Gestão, contabilidade e taxas.",
  },
  {
    key: "distribution",
    label: "Distribuição e lançamento",
    description: "Cópias, festivais e divulgação.",
  },
];
