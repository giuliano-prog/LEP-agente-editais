/**
 * Contrato de acesso a dados do Assistente LEP (ADR-0027).
 *
 * Toda instância é LIGADA a uma única área de trabalho (org + edital + inscrição): as
 * ferramentas nunca recebem org_id/workspace_id do modelo, então não conseguem alcançar
 * outra inscrição. A implementação real (`supabase-store.ts`) usa a sessão do usuário
 * (RLS do banco); os testes usam uma implementação em memória.
 */
import type { Edital, OrgDocument, Proponent, WorkspaceItem, WorkspaceRules } from "@lep/funding";
import type { Confidence, Evidence, SourceKind } from "./evidence";

export type WorkspaceRow = {
  id: string;
  editalId: string;
  projetoId: string | null;
  status: "preparing" | "ready" | "submitted" | "archived";
  requestedAmount: number | null;
  totalBudget: number | null;
  counterpartAmount: number | null;
  notes: string | null;
  rules: WorkspaceRules;
  rulesExtractedAt: string | null;
};

export type ProductionRow = {
  id: string;
  title: string;
  format: string | null;
  genre: string | null;
  stage: string | null;
  budget: number | null;
  synopsis: string | null;
};

export const FINDING_KINDS = [
  "inconsistency",
  "risk",
  "pending_decision",
  "observation",
  "recommendation",
  "evaluation_criterion",
  "scoring_opportunity",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  inconsistency: "Inconsistência",
  risk: "Risco",
  pending_decision: "Decisão pendente",
  observation: "Observação",
  recommendation: "Recomendação",
  evaluation_criterion: "Critério de avaliação",
  scoring_opportunity: "Oportunidade de pontuação",
};

export const SEVERITIES = ["high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type FindingRow = {
  id: string;
  kind: FindingKind;
  dedupeKey: string;
  title: string;
  detail: string | null;
  severity: Severity;
  status: "open" | "resolved" | "dismissed";
  confidence: Confidence;
  sourceKind: SourceKind;
  evidence: Partial<Evidence>;
  points: number | null;
  itemId: string | null;
  createdVia: "assistant" | "user";
  resolution: string | null;
  updatedAt: string | null;
};

/** Campos que o agente pode gravar num item (mapeados para colunas pela implementação). */
export type ItemFields = {
  category?: WorkspaceItem["category"];
  title?: string;
  description?: string | null;
  requirement?: WorkspaceItem["requirement"];
  origin?: "edital" | "manual";
  sourceKey?: string | null;
  evidenceText?: string | null;
  status?: WorkspaceItem["status"];
  responsibleId?: string | null;
  dueDate?: string | null;
  charLimit?: number | null;
  wordLimit?: number | null;
  pageLimit?: number | null;
  content?: string | null;
  orgDocumentId?: string | null;
  notes?: string | null;
  confidence?: Confidence | null;
  sourceKind?: SourceKind | null;
  evidenceDocument?: string | null;
  evidencePage?: number | null;
  evidenceSection?: string | null;
  analyzedAt?: string | null;
  aiSuggestion?: string | null;
  aiSuggestionAt?: string | null;
};

/** Item com os campos de evidência/autoria (além do modelo da Área de Trabalho). */
export type AssistantItem = WorkspaceItem & {
  confidence: Confidence | null;
  sourceKind: SourceKind | null;
  evidenceDocument: string | null;
  evidencePage: number | null;
  evidenceSection: string | null;
  updatedVia: "user" | "assistant";
  aiSuggestion: string | null;
};

export type FindingFields = Partial<
  Omit<FindingRow, "id" | "updatedAt" | "createdVia" | "kind" | "dedupeKey">
> & { kind?: FindingKind; dedupeKey?: string };

export type ActionRecord = {
  tool: string;
  kind: "read" | "write" | "proposal";
  status: "ok" | "error" | "rejected" | "pending_confirmation";
  summary: string;
  input: unknown;
  before?: unknown;
  after?: unknown;
  targetTable?: string | null;
  targetId?: string | null;
  evidence?: Partial<Evidence> | null;
  confidence?: Confidence | null;
  proposal?: unknown;
  error?: string | null;
};

export type RecentAction = {
  tool: string;
  status: string;
  summary: string | null;
  createdAt: string;
  via: "assistant";
};

export type PagedEditalDocument = {
  documentId: string | null;
  label: string;
  source: "pdf" | "page" | "fields";
  pages: string[];
  truncated: boolean;
};

export interface AssistantStore {
  readonly orgId: string;
  workspace(): Promise<WorkspaceRow>;
  edital(): Promise<Edital>;
  proponent(): Promise<Proponent>;
  production(): Promise<ProductionRow | null>;
  projects(): Promise<{ id: string; title: string }[]>;
  members(): Promise<{ id: string; name: string }[]>;
  items(): Promise<AssistantItem[]>;
  insertItem(fields: ItemFields): Promise<AssistantItem>;
  /** Atualiza item DESTA área de trabalho (lança erro se não pertencer). */
  updateItem(id: string, fields: ItemFields): Promise<AssistantItem>;
  documents(): Promise<OrgDocument[]>;
  findings(): Promise<FindingRow[]>;
  insertFinding(
    fields: FindingFields & { kind: FindingKind; dedupeKey: string; title: string },
  ): Promise<FindingRow>;
  updateFinding(id: string, fields: FindingFields): Promise<FindingRow>;
  updateWorkspace(
    fields: Partial<
      Pick<
        WorkspaceRow,
        "projetoId" | "requestedAmount" | "totalBudget" | "counterpartAmount" | "status" | "notes"
      >
    >,
  ): Promise<void>;
  editalPages(): Promise<{ documents: PagedEditalDocument[]; notes: string[] }>;
  pendingChanges(): Promise<number>;
  latestEditalDocumentAt(): Promise<string | null>;
  /** Checklist determinístico da Área de Trabalho (ADR-0026): só acrescenta itens. */
  syncChecklist(): Promise<{ added: number; notes: string[] }>;
  recordAction(action: ActionRecord): Promise<void>;
  recentActions(limit: number): Promise<RecentAction[]>;
}
