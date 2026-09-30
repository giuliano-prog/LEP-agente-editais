/**
 * "Analisar Edital" (V1): monta a análise de um PDF SEM cadastrar nada.
 * Reaproveita o motor existente — `extractFields` (prazo, valores, formatos, com
 * evidência), `assessEligibility` (território, sempre a LEP como proponente),
 * `matchProjects`/`summarizeAdherence` (Match v2) — e `extractHighlights` para os
 * trechos literais (objeto, participação, requisitos, documentos).
 * Nenhuma IA: o que não é encontrado aparece como "não identificado".
 */
import {
  ELIGIBILITY_LABELS,
  extractFields,
  extractHighlights,
  extractionNotes,
  editalStatusLabel,
  matchProjects,
  RESTRICTED_ELIGIBILITY,
  suggestionColumns,
  summarizeAdherence,
  territoryLabel,
  toEdital,
  type Adherence,
  type EligibilityAssessment,
  type Evidence,
  type Highlight,
  type MatchProject,
  type PdfReading,
  type Proponent,
  VERDICT_LABELS,
} from "@lep/funding";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { daysUntil, formatBRL, formatDate } from "@/lib/format";
import { DEADLINE_SOON_DAYS } from "./metrics";

/** Informação com a origem (trecho do documento), pronta para a tela. */
export type SourcedValue = { value: string; evidence: Evidence | null };

export type CompatibleProduction = {
  id: string;
  title: string;
  score: number | null;
  verdict: string;
};

export type EditalAnalysisView = {
  fileName: string;
  pages: number;
  title: string;
  institution: SourcedValue | null;
  summary: Highlight | null;
  deadline: SourcedValue | null;
  opensAt: SourcedValue | null;
  situation: string | null;
  totalAmount: SourcedValue | null;
  maxAmountPerProject: SourcedValue | null;
  projectCount: SourcedValue | null;
  formats: SourcedValue | null;
  genres: SourcedValue | null;
  stages: SourcedValue | null;
  participation: Highlight[];
  requirements: Highlight[];
  documents: Highlight[];
  territoriality: {
    status: string;
    label: string;
    reason: string;
    evidence: string | null;
    territories: string[];
  };
  attention: string[];
  adherence: Adherence | null;
  compatible: CompatibleProduction[];
  duplicate: { editalId: string; title: string } | null;
};

export type AnalysisInput = {
  fileName: string;
  suggestedTitle: string;
  text: string;
  pdf: PdfReading | null;
  eligibility: EligibilityAssessment;
  projects: MatchProject[] | null;
  proponent: Proponent;
  duplicate: { editalId: string; title: string } | null;
  now: Date;
};

const PDF_LABEL = "Documento (PDF)";

function todayInBrasilia(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function assembleAnalysis(input: AnalysisInput): EditalAnalysisView {
  const { text, pdf, now } = input;
  const fields = extractFields([{ kind: "pdf", text, label: PDF_LABEL }]);
  const highlights = extractHighlights(text, { kind: "pdf", label: PDF_LABEL });
  const title = highlights.title?.text ?? input.suggestedTitle;

  // Mesmo formato de linha de core.editais: o Match roda exatamente como no cadastro.
  const columns = suggestionColumns(fields, { today: todayInBrasilia(now), pdf });
  const edital = toEdital({
    id: "analise",
    title,
    ...columns,
    eligible_territories: input.eligibility.territories,
    eligibility_status: input.eligibility.status,
    eligibility_reason: input.eligibility.reason,
    eligibility_evidence: input.eligibility.evidence,
    eligibility_source: "auto",
  });
  const results = input.projects
    ? matchProjects(edital, input.projects, now, input.proponent)
    : null;

  const list = (vocabulary: Record<string, string>, values: string[] | undefined) =>
    values?.length ? values.map((code) => labelOf(vocabulary, code)).join(", ") : null;
  const sourced = (value: string | null, evidence: Evidence | undefined): SourcedValue | null =>
    value ? { value, evidence: evidence ?? null } : null;

  const attention = [...extractionNotes(fields, pdf)];
  if (!text.trim() && !pdf?.scanned && !pdf?.error) {
    attention.push("Não foi possível ler texto neste PDF: confira o documento manualmente.");
  }
  if (!fields.deadline) attention.push("Prazo de inscrição não identificado no documento.");
  if (fields.deadline && edital.status === "closed") {
    attention.push(`Inscrições encerradas em ${formatDate(fields.deadline.value)}.`);
  } else if (fields.deadline) {
    const days = daysUntil(fields.deadline.value, now);
    if (days !== null && days >= 0 && days <= DEADLINE_SOON_DAYS) {
      attention.push(`Prazo próximo: ${days === 0 ? "encerra hoje" : `faltam ${days} dia(s)`}.`);
    }
  }
  if (RESTRICTED_ELIGIBILITY.has(input.eligibility.status)) {
    attention.push(`Territorialidade: ${input.eligibility.reason}`);
  } else if (input.eligibility.status !== "eligible") {
    attention.push(`Elegibilidade da LEP a confirmar: ${input.eligibility.reason}`);
  }
  if (input.duplicate) {
    attention.push(`Este documento já está nos Editais: “${input.duplicate.title}”.`);
  }
  if (input.projects && input.projects.length === 0) {
    attention.push("Nenhuma produção cadastrada: a aderência não pôde ser calculada.");
  }

  return {
    fileName: input.fileName,
    pages: pdf?.pages ?? 0,
    title,
    institution: highlights.institution
      ? { value: highlights.institution.text, evidence: highlights.institution.evidence }
      : null,
    summary: highlights.object,
    deadline: sourced(
      fields.deadline ? formatDate(fields.deadline.value) : null,
      fields.deadline?.evidence,
    ),
    opensAt: sourced(
      fields.opensAt ? formatDate(fields.opensAt.value) : null,
      fields.opensAt?.evidence,
    ),
    situation: fields.deadline ? editalStatusLabel(edital.status) : null,
    totalAmount: sourced(
      fields.totalAmount ? formatBRL(fields.totalAmount.value) : null,
      fields.totalAmount?.evidence,
    ),
    maxAmountPerProject: sourced(
      fields.maxAmountPerProject ? formatBRL(fields.maxAmountPerProject.value) : null,
      fields.maxAmountPerProject?.evidence,
    ),
    projectCount: sourced(
      fields.projectCount ? String(fields.projectCount.value) : null,
      fields.projectCount?.evidence,
    ),
    formats: sourced(list(PROJECT_FORMATS, fields.formats?.value), fields.formats?.evidence),
    genres: sourced(list(PROJECT_GENRES, fields.genres?.value), fields.genres?.evidence),
    stages: sourced(list(PROJECT_STAGES, fields.stages?.value), fields.stages?.evidence),
    participation: highlights.participation,
    requirements: highlights.requirements,
    documents: highlights.documents,
    territoriality: {
      status: input.eligibility.status,
      label: ELIGIBILITY_LABELS[input.eligibility.status],
      reason: input.eligibility.reason,
      evidence: input.eligibility.evidence,
      territories: input.eligibility.territories.map((code) => territoryLabel(code)),
    },
    attention,
    adherence: results ? summarizeAdherence(results) : null,
    compatible: (results ?? [])
      .filter((result) => result.verdict !== "incompatible")
      .map((result) => ({
        id: result.projectId,
        title: result.projectTitle,
        score: result.score,
        verdict: VERDICT_LABELS[result.verdict],
      })),
    duplicate: input.duplicate,
  };
}
