/**
 * Resumo objetivo de uma execução do Assistente (ADR-0027), calculado a partir da
 * AUDITORIA (core.agent_actions) — não do texto do modelo. Cada número leva à seção.
 */

export type ActionLite = {
  tool: string;
  kind: string;
  status: string;
  input: unknown;
  after_data: unknown;
};

export type SummaryEntry = { key: string; label: string; count: number; anchor: string };

type EntryDraft = SummaryEntry & { one: string };

export type RunSummary = {
  entries: SummaryEntry[];
  toolsUsed: number;
  errors: number;
  pendingConfirmations: number;
};

const inputOf = (action: ActionLite) =>
  (action.input && typeof action.input === "object" ? action.input : {}) as Record<string, unknown>;
const afterOf = (action: ActionLite) =>
  (action.after_data && typeof action.after_data === "object" ? action.after_data : {}) as Record<
    string,
    unknown
  >;

export function summarizeRun(actions: ActionLite[]): RunSummary {
  const ok = actions.filter(
    (action) => action.status === "ok" || action.status === "pending_confirmation",
  );
  const count = (predicate: (action: ActionLite) => boolean) => ok.filter(predicate).length;
  const createdRequirement = (category?: string) =>
    count(
      (action) =>
        action.tool === "registrar_requisito" &&
        afterOf(action).titulo !== undefined &&
        (category === undefined || inputOf(action).categoria === category),
    );
  const finding = (kind: string) =>
    count((action) => action.tool === "registrar_achado" && inputOf(action).tipo === kind);

  const drafts: EntryDraft[] = [
    {
      key: "requirements",
      label: "requisitos identificados",
      one: "requisito identificado",
      count: count((action) => action.tool === "registrar_requisito"),
      anchor: "checklist",
    },
    {
      key: "created",
      label: "itens adicionados ao checklist",
      one: "item adicionado ao checklist",
      count: createdRequirement(),
      anchor: "checklist",
    },
    {
      key: "docs_linked",
      label: "documentos encontrados no Acervo",
      one: "documento encontrado no Acervo",
      count: count((action) => action.tool === "vincular_documento_acervo"),
      anchor: "documentos",
    },
    {
      key: "inconsistencies",
      label: "inconsistências encontradas",
      one: "inconsistência encontrada",
      count: finding("inconsistency"),
      anchor: "inconsistencias",
    },
    {
      key: "risks",
      label: "riscos apontados",
      one: "risco apontado",
      count: finding("risk"),
      anchor: "inconsistencias",
    },
    {
      key: "texts",
      label: "textos preparados ou revisados",
      one: "texto preparado ou revisado",
      count: count((action) => action.tool === "registrar_texto"),
      anchor: "textos",
    },
    {
      key: "criteria",
      label: "critérios de avaliação registrados",
      one: "critério de avaliação registrado",
      count: finding("evaluation_criterion"),
      anchor: "criterios",
    },
    {
      key: "opportunities",
      label: "oportunidades de pontuação",
      one: "oportunidade de pontuação",
      count: finding("scoring_opportunity"),
      anchor: "criterios",
    },
    {
      key: "owners",
      label: "responsáveis sugeridos",
      one: "responsável sugerido",
      count: count((action) => action.tool === "definir_responsavel"),
      anchor: "equipe",
    },
    {
      key: "decisions",
      label: "decisões precisam da equipe",
      one: "decisão precisa da equipe",
      count: finding("pending_decision"),
      anchor: "decisoes",
    },
    {
      key: "proposals",
      label: "ações aguardando sua confirmação",
      one: "ação aguardando sua confirmação",
      count: count((action) => action.status === "pending_confirmation"),
      anchor: "assistente",
    },
  ];
  const entries: SummaryEntry[] = drafts
    .filter((entry) => entry.count > 0)
    .map(({ one, ...entry }) => ({ ...entry, label: entry.count === 1 ? one : entry.label }));

  return {
    entries,
    toolsUsed: actions.length,
    errors: actions.filter((action) => action.status === "error").length,
    pendingConfirmations: actions.filter((action) => action.status === "pending_confirmation")
      .length,
  };
}

/** Rótulo de fase para a interface a partir da última ferramenta usada. */
export function phaseLabel(tool: string | null): string {
  switch (tool) {
    case null:
      return "IA analisando…";
    case "consultar_edital":
    case "ler_documento_edital":
    case "buscar_no_edital":
      return "Consultando edital…";
    case "consultar_acervo":
    case "vincular_documento_acervo":
      return "Verificando documentos…";
    case "gerar_checklist_base":
    case "registrar_requisito":
    case "atualizar_item":
      return "Atualizando checklist…";
    case "preencher_dados_inscricao":
    case "consultar_producao":
      return "Analisando produção e orçamento…";
    case "registrar_achado":
    case "resolver_achado":
      return "Encontrando inconsistências…";
    case "registrar_texto":
      return "Revisando textos…";
    case "definir_responsavel":
    case "consultar_equipe":
      return "Organizando responsáveis…";
    case "recalcular_prontidao":
      return "Recalculando prontidão…";
    case "solicitar_confirmacao":
      return "Preparando decisão para você…";
    default:
      return "IA analisando…";
  }
}
