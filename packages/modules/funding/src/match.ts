import {
  labelOf,
  PROJECT_FORMATS,
  PROJECT_GENRES,
  PROJECT_STAGES,
  type ProjectFormat,
  type ProjectGenre,
  type ProjectStage,
} from "@lep/projects";
import { CLOSED_STATUSES, parseDeadline, type Edital } from "./edital";
import { ELIGIBILITY_LABELS } from "./eligibility";
import { isProponentEligible, LEP_HEADQUARTERS, territoryLabel, type Proponent } from "./territory";

/**
 * Match explicável edital × projeto.
 *
 * Regras objetivas calculadas por código (sem IA): sempre o mesmo resultado para
 * os mesmos dados. Critérios em texto livre nunca são decididos automaticamente:
 * viram "pontos de atenção" para verificação humana.
 *
 * REGRA DE NEGÓCIO: o resultado indica compatibilidade com critérios registrados;
 * nunca previsão de aprovação. Ver MATCH_DISCLAIMER.
 */

export const MATCH_DISCLAIMER =
  "Esta análise verifica a compatibilidade técnica do projeto com os critérios registrados do edital. " +
  "Não representa previsão ou garantia de aprovação, que depende da avaliação da instituição responsável. " +
  "Confirme sempre as regras no documento oficial.";

export type MatchProject = {
  id: string;
  title: string;
  format: ProjectFormat | string | null;
  genre: ProjectGenre | string | null;
  stage: ProjectStage | string | null;
  budget: number | null;
};

/** Fatores pontuados na aderência v2 (pesos somam 100). */
export type FactorKey = "format" | "stage" | "budget" | "deadline" | "genre";

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  format: 25,
  stage: 20,
  budget: 20,
  deadline: 20,
  genre: 15,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  format: "Formato",
  stage: "Estágio do projeto",
  budget: "Faixa de orçamento",
  deadline: "Prazo de inscrição",
  genre: "Gênero / tipologia",
};

/** met = 100% do peso; partial = 50%; unmet = 0; unknown = fora da conta (reduz a confiança). */
export type FactorState = "met" | "partial" | "unmet" | "unknown";

const STATE_VALUE: Record<Exclude<FactorState, "unknown">, number> = {
  met: 1,
  partial: 0.5,
  unmet: 0,
};

export type MatchItem = {
  criterion: string;
  detail: string;
  factor?: FactorKey;
  state?: FactorState;
};

/** Nível da aderência (v2). "insufficient" = poucos dados: incerteza não vira "baixa". */
export type MatchLevel = "high" | "medium" | "low" | "insufficient";

export type MatchFactor = {
  key: FactorKey;
  label: string;
  weight: number;
  state: FactorState;
  detail: string;
};

export type MatchVerdict = "compatible" | "compatible_with_pending" | "incompatible";

export type MatchResult = {
  projectId: string;
  projectTitle: string;
  verdict: MatchVerdict;
  met: MatchItem[];
  attention: MatchItem[];
  unmet: MatchItem[];
  /** v2: pontuação 0–100 sobre os fatores conhecidos (null se nenhum é conhecido). */
  score: number | null;
  /** v2: parte do peso total que pôde ser avaliada (0 a 1). */
  confidence: number;
  level: MatchLevel;
  factors: MatchFactor[];
  /** Impedimentos (elegibilidade, território, prazo encerrado): forçam nível baixo. */
  blockers: string[];
};

export const MATCH_VERSION = "v2";

export const VERDICT_LABELS: Record<MatchVerdict, string> = {
  compatible: "Compatível com os critérios registrados",
  compatible_with_pending: "Compatível, com pontos a verificar",
  incompatible: "Não atende a critérios registrados",
};

const DEADLINE_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Buckets = Pick<MatchResult, "met" | "attention" | "unmet">;

function checkList(
  buckets: Buckets,
  factor: FactorKey,
  accepted: string[],
  value: string | null,
  vocabulary: Record<string, string>,
) {
  const criterion = FACTOR_LABELS[factor];
  const acceptedLabels = accepted.map((code) => labelOf(vocabulary, code)).join(", ");
  if (accepted.length === 0) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail: "Restrição não registrada no cadastro do edital. Confirme no documento oficial.",
    });
  } else if (!value) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail: `Campo não preenchido no projeto. O edital aceita: ${acceptedLabels}.`,
    });
  } else if (accepted.includes(value)) {
    buckets.met.push({
      criterion,
      factor,
      state: "met",
      detail: `${labelOf(vocabulary, value)} — aceito pelo edital.`,
    });
  } else {
    buckets.unmet.push({
      criterion,
      factor,
      state: "unmet",
      detail: `Projeto: ${labelOf(vocabulary, value)}. O edital aceita: ${acceptedLabels}.`,
    });
  }
}

function checkBudget(buckets: Buckets, edital: Edital, budget: number | null) {
  const criterion = FACTOR_LABELS.budget;
  const factor = "budget" as const;
  const { minBudget, maxBudget } = edital;
  if (minBudget === null && maxBudget === null) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail:
        "Faixa de orçamento não registrada no cadastro do edital. Confirme no documento oficial.",
    });
    return;
  }
  const range = [
    minBudget !== null && `mínimo ${brl(minBudget)}`,
    maxBudget !== null && `máximo ${brl(maxBudget)}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (budget === null) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail: `Orçamento do projeto não informado. Edital: ${range}.`,
    });
  } else if (
    (minBudget !== null && budget < minBudget) ||
    (maxBudget !== null && budget > maxBudget)
  ) {
    buckets.unmet.push({
      criterion,
      factor,
      state: "unmet",
      detail: `Orçamento do projeto: ${brl(budget)}. Edital: ${range}.`,
    });
  } else {
    buckets.met.push({
      criterion,
      factor,
      state: "met",
      detail: `Orçamento do projeto (${brl(budget)}) dentro da faixa: ${range}.`,
    });
  }
}

function checkDeadline(buckets: Buckets, edital: Edital, now: Date) {
  const criterion = FACTOR_LABELS.deadline;
  const factor = "deadline" as const;
  if (edital.status && CLOSED_STATUSES.has(edital.status)) {
    buckets.unmet.push({
      criterion,
      factor,
      state: "unmet",
      detail: "Edital não está com inscrições abertas.",
    });
    return;
  }
  if (!edital.deadline) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail: "Prazo final não registrado. Confirme no documento oficial.",
    });
    return;
  }
  const deadline = parseDeadline(edital.deadline);
  if (!deadline) {
    buckets.attention.push({
      criterion,
      factor,
      state: "unknown",
      detail: "Prazo registrado em formato não reconhecido. Confirme a data.",
    });
    return;
  }
  const remainingDays = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
  if (remainingDays < 0) {
    buckets.unmet.push({
      criterion,
      factor,
      state: "unmet",
      detail: "Prazo de inscrição encerrado.",
    });
  } else if (remainingDays <= DEADLINE_WARNING_DAYS) {
    buckets.attention.push({
      criterion,
      factor,
      state: "partial",
      detail: `Prazo próximo: ${remainingDays === 0 ? "encerra hoje" : `${remainingDays} dia(s) restantes`}.`,
    });
  } else {
    buckets.met.push({
      criterion,
      factor,
      state: "met",
      detail: `Inscrições abertas (${remainingDays} dias restantes).`,
    });
  }
}

/**
 * Território: compara a sede do PROPONENTE (sempre a própria LEP — diretriz nº 2,
 * parceiras não contam) com os territórios aceitos pelo edital.
 */
function checkTerritory(buckets: Buckets, edital: Edital, proponent: Proponent) {
  const criterion = "Território (sede da LEP)";
  const sede = proponent.state
    ? `${proponent.city ?? "?"}/${proponent.state}`
    : "sede não cadastrada";
  if (edital.eligibleTerritories.length === 0) {
    buckets.attention.push({
      criterion,
      detail: `Restrição territorial não registrada no cadastro do edital. Confirme se aceita proponentes de ${sede}.`,
    });
  } else if (!proponent.state) {
    buckets.attention.push({
      criterion,
      detail: "Sede do proponente não cadastrada na organização.",
    });
  } else if (isProponentEligible(edital.eligibleTerritories, proponent)) {
    buckets.met.push({
      criterion,
      detail: `Aceita ${edital.eligibleTerritories.map(territoryLabel).join(", ")} — LEP sediada em ${sede}.`,
    });
  } else {
    buckets.unmet.push({
      criterion,
      detail: `Exclusivo para ${edital.eligibleTerritories.map(territoryLabel).join(", ")}; a LEP é sediada em ${sede}.`,
    });
  }
}

export function matchProject(
  edital: Edital,
  project: MatchProject,
  now: Date = new Date(),
  proponent: Proponent = LEP_HEADQUARTERS,
): MatchResult {
  const buckets: Buckets = { met: [], attention: [], unmet: [] };

  if (edital.reviewStatus !== "validated") {
    buckets.attention.push({
      criterion: "Revisão do edital",
      detail:
        "Dados do edital ainda não revisados por alguém da equipe. Trate este resultado como preliminar.",
    });
  }

  checkDeadline(buckets, edital, now);
  checkTerritory(buckets, edital, proponent);
  checkEligibility(buckets, edital);
  checkList(buckets, "format", edital.acceptedFormats, project.format, PROJECT_FORMATS);
  checkList(buckets, "genre", edital.acceptedGenres, project.genre, PROJECT_GENRES);
  checkList(buckets, "stage", edital.acceptedStages, project.stage, PROJECT_STAGES);
  checkBudget(buckets, edital, project.budget);

  for (const criterion of edital.eligibilityCriteria) {
    buckets.attention.push({ criterion: "Verificar manualmente", detail: criterion });
  }
  for (const document of edital.requiredDocuments) {
    buckets.attention.push({ criterion: "Documento pendente", detail: document });
  }

  const verdict: MatchVerdict =
    buckets.unmet.length > 0
      ? "incompatible"
      : buckets.attention.length > 0
        ? "compatible_with_pending"
        : "compatible";

  return {
    projectId: project.id,
    projectTitle: project.title,
    verdict,
    ...buckets,
    ...scoreBuckets(buckets),
  };
}

const GATE_CRITERIA = new Set([
  FACTOR_LABELS.deadline,
  "Território (sede da LEP)",
  "Elegibilidade da LEP",
]);

/** Aderência v2: pontuação por fatores + confiança + impedimentos (explicáveis). */
function scoreBuckets(
  buckets: Buckets,
): Pick<MatchResult, "score" | "confidence" | "level" | "factors" | "blockers"> {
  const factors: MatchFactor[] = [...buckets.met, ...buckets.attention, ...buckets.unmet]
    .filter((item): item is MatchItem & { factor: FactorKey; state: FactorState } =>
      Boolean(item.factor && item.state),
    )
    .map((item) => ({
      key: item.factor,
      label: FACTOR_LABELS[item.factor],
      weight: FACTOR_WEIGHTS[item.factor],
      state: item.state,
      detail: item.detail,
    }))
    .sort((a, b) => b.weight - a.weight);
  const known = factors.filter((factor) => factor.state !== "unknown");
  const knownWeight = known.reduce((total, factor) => total + factor.weight, 0);
  const totalWeight = Object.values(FACTOR_WEIGHTS).reduce((total, weight) => total + weight, 0);
  const points = known.reduce(
    (total, factor) =>
      total + factor.weight * STATE_VALUE[factor.state as Exclude<FactorState, "unknown">],
    0,
  );
  const score = knownWeight > 0 ? Math.round((points / knownWeight) * 100) : null;
  const confidence = Math.round((knownWeight / totalWeight) * 100) / 100;
  const blockers = buckets.unmet
    .filter((item) => GATE_CRITERIA.has(item.criterion))
    .map((item) => `${item.criterion}: ${item.detail}`);
  const level: MatchLevel =
    blockers.length > 0
      ? "low"
      : confidence < 0.4 || score === null
        ? "insufficient"
        : score >= 75
          ? "high"
          : score >= 50
            ? "medium"
            : "low";
  return { score, confidence, level, factors, blockers };
}

/**
 * Elegibilidade (etapa 5) no Match: impedimentos que não são de território
 * (pessoa física, decisão da equipe, via parceiro) e restrição territorial sem
 * territórios registrados. Os demais casos já aparecem no critério de território.
 */
function checkEligibility(buckets: Buckets, edital: Edital) {
  const criterion = "Elegibilidade da LEP";
  const reason = edital.eligibilityReason ? ` ${edital.eligibilityReason}` : "";
  switch (edital.eligibilityStatus) {
    case "individual":
    case "not_eligible":
    case "via_partner":
      buckets.unmet.push({
        criterion,
        detail: `${ELIGIBILITY_LABELS[edital.eligibilityStatus]}.${reason}`,
      });
      break;
    case "territorial_restriction":
      if (edital.eligibleTerritories.length === 0) {
        buckets.unmet.push({ criterion, detail: `Restrição territorial.${reason}` });
      }
      break;
    case "needs_review":
      buckets.attention.push({ criterion, detail: `Necessita revisão.${reason}` });
      break;
    default:
      break;
  }
}

/** Ordena pela aderência v2: alta, média, dados insuficientes, baixa; depois pela pontuação. */
export function matchProjects(
  edital: Edital,
  projects: MatchProject[],
  now: Date = new Date(),
  proponent: Proponent = LEP_HEADQUARTERS,
): MatchResult[] {
  const order: Record<MatchLevel, number> = { high: 0, medium: 1, insufficient: 2, low: 3 };
  return projects
    .map((project) => matchProject(edital, project, now, proponent))
    .sort(
      (a, b) =>
        order[a.level] - order[b.level] ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.unmet.length - b.unmet.length,
    );
}

/**
 * Dados que determinam o Match (texto canônico). O servidor calcula o SHA-256
 * disto (inputs_hash) para saber se o cálculo gravado ainda vale.
 */
export function matchInputs(edital: Edital, project: MatchProject, proponent: Proponent): string {
  return JSON.stringify({
    version: MATCH_VERSION,
    edital: {
      status: edital.status,
      deadline: edital.deadline,
      reviewStatus: edital.reviewStatus,
      eligibilityStatus: edital.eligibilityStatus,
      eligibleTerritories: edital.eligibleTerritories,
      acceptedFormats: edital.acceptedFormats,
      acceptedGenres: edital.acceptedGenres,
      acceptedStages: edital.acceptedStages,
      minBudget: edital.minBudget,
      maxBudget: edital.maxBudget,
      eligibilityCriteria: edital.eligibilityCriteria,
      requiredDocuments: edital.requiredDocuments,
    },
    project: {
      format: project.format,
      genre: project.genre,
      stage: project.stage,
      budget: project.budget,
    },
    proponent,
  });
}
