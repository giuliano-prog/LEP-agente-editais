/**
 * Prontidão da inscrição (Área de Trabalho do Edital, ADR-0026).
 *
 * Cruza, por regras determinísticas, o edital (regras e prazos), o checklist, a
 * produção vinculada (Match v2), o acervo de documentos (validades) e os valores do
 * orçamento. Responde às perguntas operacionais da equipe ("o que falta?", "o
 * orçamento respeita o teto?"...). Nunca afirma aprovação (MATCH_DISCLAIMER) e
 * restrições de elegibilidade ficam "a confirmar pela equipe" — nunca decididas aqui.
 */
import { CLOSED_STATUSES, parseDeadline, type Edital } from "../edital";
import { ELIGIBILITY_LABELS, RESTRICTED_ELIGIBILITY } from "../eligibility";
import type { MatchProject, MatchResult } from "../match";
import { normalize } from "../territory";
import type { ItemCategory, OrgDocument, WorkspaceItem, WorkspaceStatus } from "./model";
import type { WorkspaceRules } from "./rules";

export type WorkspaceSnapshot = {
  projetoId: string | null;
  status: WorkspaceStatus;
  requestedAmount: number | null;
  totalBudget: number | null;
  counterpartAmount: number | null;
  rules: WorkspaceRules;
  rulesExtractedAt: string | null;
};

export type AssessInput = {
  edital: Edital;
  workspace: WorkspaceSnapshot;
  items: WorkspaceItem[];
  production: MatchProject | null;
  match: MatchResult | null;
  documents: OrgDocument[];
  /** Alterações/retificações detectadas e ainda não revisadas. */
  pendingChanges: number;
  /** Data do documento do edital mais recente (para saber se as regras estão em dia). */
  latestEditalDocumentAt: string | null;
  now: Date;
};

/** blocker = impede a inscrição; error = precisa corrigir; warning = atenção; info = lembrete. */
export type Severity = "blocker" | "error" | "warning" | "info";

export type Finding = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  itemId?: string;
  /** Seção da Área de Trabalho onde se resolve. */
  section: WorkspaceSection;
};

export type WorkspaceSection =
  | "resumo"
  | "producao"
  | "checklist"
  | "documentos"
  | "textos"
  | "orcamento"
  | "equipe"
  | "direitos"
  | "criterios";

export type TextMetrics = {
  chars: number;
  charsNoSpaces: number;
  words: number;
  /** Estimativa (≈ 500 palavras por página, fonte 12, espaço simples). */
  estimatedPages: number;
  overChars: boolean;
  overWords: boolean;
  overPages: boolean;
};

export type BudgetCheck = {
  key: string;
  label: string;
  state: "ok" | "fail" | "unknown" | "info";
  detail: string;
};

export type ReadinessLevel = "blocked" | "not_started" | "in_progress" | "almost" | "ready";

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  blocked: "Bloqueada",
  not_started: "Não iniciada",
  in_progress: "Em preparação",
  almost: "Quase pronta",
  ready: "Pronta para inscrever",
};

export type Answer = { question: string; answer: string; tone: "ok" | "warn" | "bad" | "neutral" };

export type NextAction = {
  key: string;
  title: string;
  detail: string;
  itemId?: string;
  section: WorkspaceSection;
};

export type WorkspaceAssessment = {
  readiness: {
    level: ReadinessLevel;
    label: string;
    percent: number;
    mandatoryDone: number;
    mandatoryTotal: number;
  };
  daysLeft: number | null;
  findings: Finding[];
  pending: WorkspaceItem[];
  bonusPending: WorkspaceItem[];
  textMetrics: Record<string, TextMetrics>;
  budgetChecks: BudgetCheck[];
  expiredDocuments: OrgDocument[];
  nextActions: NextAction[];
  answers: Answer[];
};

export const WORDS_PER_PAGE = 500;

export function measureText(
  content: string | null,
  limits: Pick<WorkspaceItem, "charLimit" | "wordLimit" | "pageLimit"> = {
    charLimit: null,
    wordLimit: null,
    pageLimit: null,
  },
): TextMetrics {
  const value = content ?? "";
  const chars = [...value].length;
  const charsNoSpaces = [...value.replace(/\s/g, "")].length;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const estimatedPages = words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
  return {
    chars,
    charsNoSpaces,
    words,
    estimatedPages,
    overChars: limits.charLimit !== null && chars > limits.charLimit,
    overWords: limits.wordLimit !== null && words > limits.wordLimit,
    overPages: limits.pageLimit !== null && estimatedPages > limits.pageLimit,
  };
}

const DAY = 86_400_000;
const isOpen = (item: WorkspaceItem) => item.status === "pending" || item.status === "in_progress";
const counts = (item: WorkspaceItem) => item.status !== "not_applicable";
const DOCUMENT_CATEGORIES = new Set<ItemCategory>(["document", "rights", "annex"]);
const CATEGORY_ORDER: ItemCategory[] = [
  "eligibility",
  "document",
  "rights",
  "text",
  "budget",
  "team",
  "annex",
  "other",
];
const SECTION_OF: Record<ItemCategory, WorkspaceSection> = {
  eligibility: "resumo",
  document: "documentos",
  annex: "documentos",
  rights: "direitos",
  text: "textos",
  budget: "orcamento",
  team: "equipe",
  other: "checklist",
};
const SEVERITY_ORDER: Severity[] = ["blocker", "error", "warning", "info"];

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const dateBR = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function todayIso(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

function budgetChecks(input: AssessInput): BudgetCheck[] {
  const { edital, workspace, production } = input;
  const {
    requestedAmount: requested,
    totalBudget: total,
    counterpartAmount: counterpart,
  } = workspace;
  const checks: BudgetCheck[] = [];

  if (edital.maxAmountPerProject !== null) {
    checks.push(
      requested === null
        ? {
            key: "cap",
            label: "Teto por projeto",
            state: "unknown",
            detail: `Teto do edital: ${brl(edital.maxAmountPerProject)}. Informe o valor solicitado.`,
          }
        : {
            key: "cap",
            label: "Teto por projeto",
            state: requested <= edital.maxAmountPerProject ? "ok" : "fail",
            detail:
              requested <= edital.maxAmountPerProject
                ? `Solicitado ${brl(requested)} dentro do teto de ${brl(edital.maxAmountPerProject)}.`
                : `Solicitado ${brl(requested)} acima do teto de ${brl(edital.maxAmountPerProject)} (excesso de ${brl(requested - edital.maxAmountPerProject)}).`,
          },
    );
  } else {
    checks.push({
      key: "cap",
      label: "Teto por projeto",
      state: "unknown",
      detail: "Teto por projeto não registrado no edital: confira no regulamento.",
    });
  }

  if (edital.minBudget !== null || edital.maxBudget !== null) {
    const range = [
      edital.minBudget !== null ? `mínimo ${brl(edital.minBudget)}` : null,
      edital.maxBudget !== null ? `máximo ${brl(edital.maxBudget)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (total === null) {
      checks.push({
        key: "range",
        label: "Faixa de orçamento do projeto",
        state: "unknown",
        detail: `Faixa aceita: ${range}. Informe o orçamento total.`,
      });
    } else {
      const inside =
        (edital.minBudget === null || total >= edital.minBudget) &&
        (edital.maxBudget === null || total <= edital.maxBudget);
      checks.push({
        key: "range",
        label: "Faixa de orçamento do projeto",
        state: inside ? "ok" : "fail",
        detail: `Orçamento total ${brl(total)} — faixa aceita: ${range}.`,
      });
    }
  }

  if (requested !== null && total !== null) {
    checks.push({
      key: "requested-total",
      label: "Solicitado × orçamento total",
      state: requested <= total ? "ok" : "fail",
      detail:
        requested <= total
          ? `O valor solicitado cobre ${Math.round((requested / Math.max(total, 1)) * 100)}% do orçamento total.`
          : `O valor solicitado (${brl(requested)}) é maior que o orçamento total (${brl(total)}).`,
    });
  }

  const rule = workspace.rules.counterpartMinPercent;
  if (rule) {
    if (total === null || counterpart === null) {
      checks.push({
        key: "counterpart",
        label: `Contrapartida mínima (${rule.value}%)`,
        state: "unknown",
        detail: "Informe o orçamento total e a contrapartida para conferir.",
      });
    } else {
      const needed = (total * rule.value) / 100;
      checks.push({
        key: "counterpart",
        label: `Contrapartida mínima (${rule.value}%)`,
        state: counterpart >= needed ? "ok" : "fail",
        detail: `Contrapartida ${brl(counterpart)}; mínimo exigido ${brl(needed)}.`,
      });
    }
  }

  if (workspace.rules.adminMaxPercent) {
    checks.push({
      key: "admin",
      label: `Despesas administrativas (até ${workspace.rules.adminMaxPercent.value}%)`,
      state: "info",
      detail: "Limite identificado no edital: confira na planilha orçamentária.",
    });
  }

  if (production?.budget && total !== null && production.budget > 0) {
    const diff = Math.abs(production.budget - total) / production.budget;
    if (diff > 0.1) {
      checks.push({
        key: "production-budget",
        label: "Orçamento da produção cadastrada",
        state: "info",
        detail: `A produção tem orçamento cadastrado de ${brl(production.budget)}; nesta inscrição, ${brl(total)}.`,
      });
    }
  }
  return checks;
}

export function assessWorkspace(input: AssessInput): WorkspaceAssessment {
  const { edital, workspace, items, match, documents, now } = input;
  const today = todayIso(now);
  const deadline = parseDeadline(edital.deadline);
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / DAY) : null;
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  // Impedimentos ------------------------------------------------------------------------
  if (
    (edital.status && CLOSED_STATUSES.has(edital.status)) ||
    (deadline && deadline.getTime() < now.getTime())
  ) {
    add({
      key: "closed",
      severity: "blocker",
      title: "Inscrições encerradas",
      detail: edital.deadline
        ? `O prazo terminou em ${dateBR(edital.deadline)}.`
        : "O edital está encerrado/suspenso.",
      section: "resumo",
    });
  }
  if (RESTRICTED_ELIGIBILITY.has(edital.eligibilityStatus)) {
    add({
      key: "eligibility",
      severity: "blocker",
      title: `Elegibilidade: ${ELIGIBILITY_LABELS[edital.eligibilityStatus]}`,
      detail: `${edital.eligibilityReason ?? "Restrição identificada."} Confirme na aba Elegibilidade (decisão da equipe).`,
      section: "resumo",
    });
  } else if (edital.eligibilityStatus !== "eligible") {
    add({
      key: "eligibility",
      severity: "warning",
      title: `Elegibilidade da LEP: ${ELIGIBILITY_LABELS[edital.eligibilityStatus]}`,
      detail: edital.eligibilityReason ?? "Confirme se a LEP pode ser proponente.",
      section: "resumo",
    });
  }
  if (!workspace.projetoId) {
    add({
      key: "production",
      severity: "blocker",
      title: "Nenhuma produção vinculada",
      detail: "Escolha a produção que será inscrita para cruzar formato, estágio e orçamento.",
      section: "producao",
    });
  } else if (match) {
    for (const blocker of match.blockers) {
      if (/eleg|territ|prazo|encerr/.test(normalize(blocker))) continue; // já tratados acima
      add({
        key: `match-blocker:${blocker}`,
        severity: "blocker",
        title: "Impedimento no Match",
        detail: blocker,
        section: "producao",
      });
    }
    for (const unmet of match.unmet) {
      add({
        key: `match-unmet:${unmet.criterion}`,
        severity: "error",
        title: `A produção não atende: ${unmet.criterion}`,
        detail: unmet.detail,
        section: "producao",
      });
    }
  }

  // Regras do edital em dia ----------------------------------------------------------------
  if (!workspace.rulesExtractedAt) {
    add({
      key: "rules-missing",
      severity: "warning",
      title: "Checklist ainda não gerado a partir do edital",
      detail:
        "Use “Gerar checklist do edital” para ler documentos, textos, critérios e direitos exigidos.",
      section: "checklist",
    });
  } else if (
    input.latestEditalDocumentAt &&
    input.latestEditalDocumentAt > workspace.rulesExtractedAt
  ) {
    add({
      key: "rules-stale",
      severity: "warning",
      title: "Há documento novo do edital após a última leitura",
      detail:
        "Atualize o checklist do edital: itens novos são acrescentados sem apagar o trabalho feito.",
      section: "checklist",
    });
  }
  if (input.pendingChanges > 0) {
    add({
      key: "changes",
      severity: "warning",
      title: plural(
        input.pendingChanges,
        "retificação/alteração não revisada",
        "retificações/alterações não revisadas",
      ),
      detail: "As regras podem ter mudado: revise no Histórico do edital e atualize o checklist.",
      section: "resumo",
    });
  }

  // Textos -------------------------------------------------------------------------------------
  const textMetrics: Record<string, TextMetrics> = {};
  for (const item of items.filter((entry) => entry.category === "text")) {
    const metrics = measureText(item.content, item);
    textMetrics[item.id] = metrics;
    const over = [
      metrics.overChars && `${metrics.chars} de ${item.charLimit} caracteres`,
      metrics.overWords && `${metrics.words} de ${item.wordLimit} palavras`,
      metrics.overPages && `≈${metrics.estimatedPages} de ${item.pageLimit} página(s) (estimativa)`,
    ].filter(Boolean);
    if (over.length > 0) {
      add({
        key: `text-over:${item.id}`,
        severity: "error",
        title: `“${item.title}” excede o limite`,
        detail: over.join(" · "),
        itemId: item.id,
        section: "textos",
      });
    }
    if (item.status === "done" && metrics.chars === 0) {
      add({
        key: `text-empty:${item.id}`,
        severity: "warning",
        title: `“${item.title}” marcado como concluído sem texto na plataforma`,
        detail: "Cole a versão final para a plataforma conferir os limites.",
        itemId: item.id,
        section: "textos",
      });
    }
  }

  // Documentos do acervo --------------------------------------------------------------------
  const docsById = new Map(documents.map((doc) => [doc.id, doc]));
  const expiredDocuments: OrgDocument[] = [];
  for (const item of items) {
    const doc = item.orgDocumentId ? docsById.get(item.orgDocumentId) : null;
    if (doc?.validUntil && counts(item)) {
      if (doc.validUntil < today) {
        expiredDocuments.push(doc);
        add({
          key: `doc-expired:${item.id}`,
          severity: "error",
          title: `Documento vencido: ${doc.title}`,
          detail: `Venceu em ${dateBR(doc.validUntil)} — emita uma nova versão para “${item.title}”.`,
          itemId: item.id,
          section: "documentos",
        });
      } else if (edital.deadline && doc.validUntil < edital.deadline.slice(0, 10)) {
        add({
          key: `doc-expiring:${item.id}`,
          severity: "warning",
          title: `Documento vence antes do prazo: ${doc.title}`,
          detail: `Válido até ${dateBR(doc.validUntil)}; o edital encerra em ${dateBR(edital.deadline)}.`,
          itemId: item.id,
          section: "documentos",
        });
      }
    }
    if (
      item.status === "done" &&
      DOCUMENT_CATEGORIES.has(item.category) &&
      !item.orgDocumentId &&
      !item.notes
    ) {
      add({
        key: `doc-missing:${item.id}`,
        severity: "warning",
        title: `“${item.title}” concluído sem documento vinculado`,
        detail: "Vincule o documento do acervo ou registre onde está (observação).",
        itemId: item.id,
        section: SECTION_OF[item.category],
      });
    }
    if (
      item.dueDate &&
      edital.deadline &&
      isOpen(item) &&
      item.dueDate > edital.deadline.slice(0, 10)
    ) {
      add({
        key: `due-late:${item.id}`,
        severity: "warning",
        title: `Prazo interno depois do prazo do edital: ${item.title}`,
        detail: `Prazo interno ${dateBR(item.dueDate)}; edital encerra em ${dateBR(edital.deadline)}.`,
        itemId: item.id,
        section: SECTION_OF[item.category],
      });
    } else if (item.dueDate && isOpen(item) && item.dueDate < today) {
      add({
        key: `due-overdue:${item.id}`,
        severity: "warning",
        title: `Prazo interno vencido: ${item.title}`,
        detail: `Previsto para ${dateBR(item.dueDate)}.`,
        itemId: item.id,
        section: SECTION_OF[item.category],
      });
    }
  }
  for (const doc of documents) {
    if (doc.validUntil && doc.validUntil < today && !expiredDocuments.includes(doc)) {
      expiredDocuments.push(doc);
    }
  }

  // Orçamento ---------------------------------------------------------------------------------------
  const checks = budgetChecks(input);
  for (const check of checks.filter((entry) => entry.state === "fail")) {
    add({
      key: `budget:${check.key}`,
      severity: "error",
      title: `Orçamento: ${check.label}`,
      detail: check.detail,
      section: "orcamento",
    });
  }

  // Prontidão ------------------------------------------------------------------------------------------
  const mandatory = items.filter((item) => item.requirement === "mandatory" && counts(item));
  const mandatoryDone = mandatory.filter((item) => item.status === "done").length;
  const percent = mandatory.length === 0 ? 0 : Math.round((mandatoryDone / mandatory.length) * 100);
  const pending = mandatory
    .filter(isOpen)
    .sort(
      (a, b) =>
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.position - b.position,
    );
  const bonusPending = items.filter((item) => item.requirement === "bonus" && isOpen(item));

  if (workspace.status === "ready" && pending.length > 0) {
    add({
      key: "status-ready",
      severity: "warning",
      title: "Marcada como pronta, mas há obrigatórios pendentes",
      detail: plural(pending.length, "item obrigatório pendente", "itens obrigatórios pendentes"),
      section: "checklist",
    });
  }
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && pending.length > 0) {
    add({
      key: "deadline-soon",
      severity: "warning",
      title: daysLeft === 0 ? "O edital encerra hoje" : `Faltam ${daysLeft} dia(s) para o prazo`,
      detail: `${plural(pending.length, "item obrigatório pendente", "itens obrigatórios pendentes")}.`,
      section: "resumo",
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const errors = findings.filter((finding) => finding.severity === "error");

  let level: ReadinessLevel;
  if (blockers.length > 0) level = "blocked";
  else if (items.length === 0) level = "not_started";
  else if (percent === 100 && errors.length === 0) level = "ready";
  else if (percent >= 75) level = "almost";
  else level = "in_progress";

  // Próximas ações: impedimentos → correções → obrigatórios (prazo interno, categoria) → bônus.
  const nextActions: NextAction[] = [];
  const pushAction = (action: NextAction) => {
    if (nextActions.length < 8 && !nextActions.some((entry) => entry.key === action.key)) {
      nextActions.push(action);
    }
  };
  for (const finding of [...blockers, ...errors]) {
    pushAction({
      key: finding.key,
      title:
        finding.severity === "blocker"
          ? `Resolver: ${finding.title}`
          : `Corrigir: ${finding.title}`,
      detail: finding.detail,
      itemId: finding.itemId,
      section: finding.section,
    });
  }
  if (!workspace.rulesExtractedAt) {
    pushAction({
      key: "rules-missing",
      title: "Gerar o checklist a partir do edital",
      detail: "Lê documentos, textos, critérios e direitos exigidos no regulamento.",
      section: "checklist",
    });
  }
  for (const item of pending) {
    pushAction({
      key: `item:${item.id}`,
      title:
        item.status === "in_progress" ? `Concluir: ${item.title}` : `Providenciar: ${item.title}`,
      detail: [
        item.dueDate ? `prazo interno ${dateBR(item.dueDate)}` : null,
        item.responsibleId ? null : "sem responsável",
      ]
        .filter(Boolean)
        .join(" · "),
      itemId: item.id,
      section: SECTION_OF[item.category],
    });
  }
  for (const item of bonusPending.slice(0, 2)) {
    pushAction({
      key: `bonus:${item.id}`,
      title: `Avaliar pontuação adicional: ${item.title}`,
      detail: "Verifique se a LEP/produção se enquadra.",
      itemId: item.id,
      section: "criterios",
    });
  }

  // Respostas às perguntas operacionais ----------------------------------------------------------------
  const docItems = items.filter((item) => DOCUMENT_CATEGORIES.has(item.category) && counts(item));
  const docMandatory = docItems.filter((item) => item.requirement === "mandatory");
  const docDone = docMandatory.filter((item) => item.status === "done").length;
  const textIssues = findings.filter(
    (finding) => finding.key.startsWith("text-over:") || finding.key.startsWith("text-empty:"),
  );
  const overLimit = findings.filter((finding) => finding.key.startsWith("text-over:"));
  const failedBudget = checks.filter((check) => check.state === "fail");
  const knownBudget = checks.filter((check) => check.state === "ok" || check.state === "fail");
  const signatures = items.filter(
    (item) =>
      isOpen(item) &&
      /(assinad|assinatura|firma reconhecida)/.test(
        normalize(`${item.title} ${item.evidence ?? ""}`),
      ),
  );
  const rightsItems = items.filter((item) => item.category === "rights" && counts(item));
  const rightsOpen = rightsItems.filter(isOpen);
  const inconsistencies = findings.filter((finding) => finding.severity !== "info");
  const done = items.filter((item) => item.status === "done");

  const answers: Answer[] = [
    {
      question: "O que falta para inscrever este projeto?",
      answer:
        blockers.length + pending.length === 0
          ? items.length === 0
            ? "Checklist vazio: gere o checklist a partir do edital."
            : "Nenhum impedimento nem item obrigatório pendente."
          : [
              blockers.length > 0 ? plural(blockers.length, "impedimento", "impedimentos") : null,
              pending.length > 0
                ? plural(
                    pending.length,
                    "item obrigatório pendente",
                    "itens obrigatórios pendentes",
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" e ") + ".",
      tone:
        blockers.length > 0 ? "bad" : pending.length > 0 ? "warn" : items.length ? "ok" : "neutral",
    },
    {
      question: "Quais documentos são obrigatórios?",
      answer:
        docMandatory.length === 0
          ? "Nenhum documento obrigatório no checklist (confira o regulamento)."
          : `${plural(docMandatory.length, "documento obrigatório", "documentos obrigatórios")}; ${docDone} concluído(s).`,
      tone: docMandatory.length === 0 ? "neutral" : docDone === docMandatory.length ? "ok" : "warn",
    },
    {
      question: "O que já temos?",
      answer:
        done.length === 0
          ? "Nenhum item concluído ainda."
          : `${plural(done.length, "item concluído", "itens concluídos")}; ${plural(
              items.filter((item) => item.orgDocumentId).length,
              "documento do acervo vinculado",
              "documentos do acervo vinculados",
            )}.`,
      tone: done.length > 0 ? "ok" : "neutral",
    },
    {
      question: "O que está inconsistente?",
      answer:
        inconsistencies.length === 0
          ? "Nenhuma inconsistência encontrada pelas regras."
          : plural(inconsistencies.length, "ponto encontrado", "pontos encontrados") +
            " — veja Inconsistências.",
      tone:
        errors.length + blockers.length > 0 ? "bad" : inconsistencies.length > 0 ? "warn" : "ok",
    },
    {
      question: "Quais textos precisam ser ajustados?",
      answer:
        textIssues.length === 0
          ? "Nenhum texto com problema identificado."
          : textIssues.map((finding) => finding.title).join("; "),
      tone: textIssues.length > 0 ? "warn" : "ok",
    },
    {
      question: "Algum texto excede limite de páginas/caracteres?",
      answer:
        overLimit.length === 0
          ? "Não, entre os textos registrados na plataforma."
          : `Sim: ${overLimit.map((finding) => finding.detail).join("; ")}.`,
      tone: overLimit.length > 0 ? "bad" : "ok",
    },
    {
      question: "O orçamento respeita o teto?",
      answer:
        failedBudget.length > 0
          ? failedBudget.map((check) => check.detail).join(" ")
          : knownBudget.length > 0
            ? "Sim, nas verificações possíveis com os dados informados."
            : "Ainda não dá para conferir: informe os valores na seção Orçamento.",
      tone: failedBudget.length > 0 ? "bad" : knownBudget.length > 0 ? "ok" : "neutral",
    },
    {
      question: "Existem documentos ou assinaturas faltantes?",
      answer:
        docMandatory.filter(isOpen).length + signatures.length === 0
          ? "Não há documentos obrigatórios nem assinaturas pendentes no checklist."
          : [
              docMandatory.filter(isOpen).length > 0
                ? plural(
                    docMandatory.filter(isOpen).length,
                    "documento pendente",
                    "documentos pendentes",
                  )
                : null,
              signatures.length > 0
                ? plural(
                    signatures.length,
                    "item com assinatura pendente",
                    "itens com assinatura pendente",
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" e ") + ".",
      tone: docMandatory.filter(isOpen).length + signatures.length > 0 ? "warn" : "ok",
    },
    {
      question: "Existem exigências de direitos ou cessões?",
      answer:
        rightsItems.length === 0
          ? "Nenhuma identificada no edital (confira cadeia de titularidade no regulamento)."
          : `${plural(rightsItems.length, "exigência", "exigências")}; ${rightsOpen.length} pendente(s).`,
      tone: rightsOpen.length > 0 ? "warn" : rightsItems.length ? "ok" : "neutral",
    },
    {
      question: "Existem oportunidades de pontuação adicional?",
      answer:
        items.filter((item) => item.requirement === "bonus").length === 0
          ? "Nenhuma identificada pelas regras."
          : `${plural(items.filter((item) => item.requirement === "bonus").length, "oportunidade", "oportunidades")}; ${bonusPending.length} a avaliar.`,
      tone: bonusPending.length > 0 ? "warn" : "neutral",
    },
    {
      question: "Qual é a próxima ação mais importante?",
      answer: nextActions[0]?.title ?? "Nada pendente: revise e envie a inscrição.",
      tone: nextActions.length === 0 ? "ok" : blockers.length > 0 ? "bad" : "warn",
    },
  ];

  return {
    readiness: {
      level,
      label: READINESS_LABELS[level],
      percent,
      mandatoryDone,
      mandatoryTotal: mandatory.length,
    },
    daysLeft,
    findings,
    pending,
    bonusPending,
    textMetrics,
    budgetChecks: checks,
    expiredDocuments,
    nextActions,
    answers,
  };
}
