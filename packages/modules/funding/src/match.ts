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

export type MatchItem = {
  criterion: string;
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
};

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
  criterion: string,
  accepted: string[],
  value: string | null,
  vocabulary: Record<string, string>,
) {
  const acceptedLabels = accepted.map((code) => labelOf(vocabulary, code)).join(", ");
  if (accepted.length === 0) {
    buckets.attention.push({
      criterion,
      detail: "Restrição não registrada no cadastro do edital. Confirme no documento oficial.",
    });
  } else if (!value) {
    buckets.attention.push({
      criterion,
      detail: `Campo não preenchido no projeto. O edital aceita: ${acceptedLabels}.`,
    });
  } else if (accepted.includes(value)) {
    buckets.met.push({ criterion, detail: `${labelOf(vocabulary, value)} — aceito pelo edital.` });
  } else {
    buckets.unmet.push({
      criterion,
      detail: `Projeto: ${labelOf(vocabulary, value)}. O edital aceita: ${acceptedLabels}.`,
    });
  }
}

function checkBudget(buckets: Buckets, edital: Edital, budget: number | null) {
  const criterion = "Faixa de orçamento";
  const { minBudget, maxBudget } = edital;
  if (minBudget === null && maxBudget === null) {
    buckets.attention.push({
      criterion,
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
      detail: `Orçamento do projeto não informado. Edital: ${range}.`,
    });
  } else if (
    (minBudget !== null && budget < minBudget) ||
    (maxBudget !== null && budget > maxBudget)
  ) {
    buckets.unmet.push({
      criterion,
      detail: `Orçamento do projeto: ${brl(budget)}. Edital: ${range}.`,
    });
  } else {
    buckets.met.push({
      criterion,
      detail: `Orçamento do projeto (${brl(budget)}) dentro da faixa: ${range}.`,
    });
  }
}

function checkDeadline(buckets: Buckets, edital: Edital, now: Date) {
  const criterion = "Prazo de inscrição";
  if (edital.status && CLOSED_STATUSES.has(edital.status)) {
    buckets.unmet.push({ criterion, detail: "Edital não está com inscrições abertas." });
    return;
  }
  if (!edital.deadline) {
    buckets.attention.push({
      criterion,
      detail: "Prazo final não registrado. Confirme no documento oficial.",
    });
    return;
  }
  const deadline = parseDeadline(edital.deadline);
  if (!deadline) {
    buckets.attention.push({
      criterion,
      detail: "Prazo registrado em formato não reconhecido. Confirme a data.",
    });
    return;
  }
  const remainingDays = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
  if (remainingDays < 0) {
    buckets.unmet.push({ criterion, detail: "Prazo de inscrição encerrado." });
  } else if (remainingDays <= DEADLINE_WARNING_DAYS) {
    buckets.attention.push({
      criterion,
      detail: `Prazo próximo: ${remainingDays === 0 ? "encerra hoje" : `${remainingDays} dia(s) restantes`}.`,
    });
  } else {
    buckets.met.push({
      criterion,
      detail: `Inscrições abertas (${remainingDays} dias restantes).`,
    });
  }
}

export function matchProject(
  edital: Edital,
  project: MatchProject,
  now: Date = new Date(),
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
  checkList(buckets, "Formato", edital.acceptedFormats, project.format, PROJECT_FORMATS);
  checkList(buckets, "Gênero / tipologia", edital.acceptedGenres, project.genre, PROJECT_GENRES);
  checkList(buckets, "Estágio do projeto", edital.acceptedStages, project.stage, PROJECT_STAGES);
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

  return { projectId: project.id, projectTitle: project.title, verdict, ...buckets };
}

/** Ordena: compatíveis primeiro, depois com pendências, por último os incompatíveis. */
export function matchProjects(
  edital: Edital,
  projects: MatchProject[],
  now: Date = new Date(),
): MatchResult[] {
  const order: Record<MatchVerdict, number> = {
    compatible: 0,
    compatible_with_pending: 1,
    incompatible: 2,
  };
  return projects
    .map((project) => matchProject(edital, project, now))
    .sort((a, b) => order[a.verdict] - order[b.verdict] || a.unmet.length - b.unmet.length);
}
