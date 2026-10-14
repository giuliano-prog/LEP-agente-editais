/**
 * Vocabulário da Área de Trabalho do Edital (ADR-0026).
 * Deve permanecer IGUAL aos CHECK da migração 20261011120000_area_trabalho_edital.sql.
 */

export const WORKSPACE_STATUSES = ["preparing", "ready", "submitted", "archived"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];
export const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatus, string> = {
  preparing: "Em preparação",
  ready: "Pronta para inscrever",
  submitted: "Inscrição enviada",
  archived: "Arquivada",
};

export const ITEM_CATEGORIES = [
  "document",
  "text",
  "budget",
  "team",
  "rights",
  "eligibility",
  "annex",
  "other",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  document: "Documentos",
  text: "Textos",
  budget: "Orçamento",
  team: "Equipe",
  rights: "Direitos e autorizações",
  eligibility: "Elegibilidade",
  annex: "Anexos",
  other: "Outros",
};

export const ITEM_REQUIREMENTS = ["mandatory", "optional", "bonus"] as const;
export type ItemRequirement = (typeof ITEM_REQUIREMENTS)[number];
export const ITEM_REQUIREMENT_LABELS: Record<ItemRequirement, string> = {
  mandatory: "Obrigatório",
  optional: "Opcional",
  bonus: "Pontuação adicional",
};

export const ITEM_STATUSES = ["pending", "in_progress", "done", "not_applicable"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluído",
  not_applicable: "Não se aplica",
};

export const ORG_DOCUMENT_SCOPES = ["company", "production"] as const;
export type OrgDocumentScope = (typeof ORG_DOCUMENT_SCOPES)[number];
export const ORG_DOCUMENT_SCOPE_LABELS: Record<OrgDocumentScope, string> = {
  company: "Produtora (LEP)",
  production: "Produção",
};

export const ORG_DOCUMENT_CATEGORIES = [
  "legal",
  "fiscal",
  "labor",
  "registration",
  "rights",
  "portfolio",
  "technical",
  "other",
] as const;
export type OrgDocumentCategory = (typeof ORG_DOCUMENT_CATEGORIES)[number];
export const ORG_DOCUMENT_CATEGORY_LABELS: Record<OrgDocumentCategory, string> = {
  legal: "Jurídico / societário",
  fiscal: "Fiscal (certidões)",
  labor: "Trabalhista",
  registration: "Registros (Ancine, CNPJ...)",
  rights: "Direitos e cessões",
  portfolio: "Portfólio / currículos",
  technical: "Técnico (roteiro, projeto...)",
  other: "Outros",
};

const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && (values as readonly string[]).includes(value);

export const isWorkspaceStatus = isOneOf(WORKSPACE_STATUSES);
export const isItemCategory = isOneOf(ITEM_CATEGORIES);
export const isItemRequirement = isOneOf(ITEM_REQUIREMENTS);
export const isItemStatus = isOneOf(ITEM_STATUSES);
export const isOrgDocumentScope = isOneOf(ORG_DOCUMENT_SCOPES);
export const isOrgDocumentCategory = isOneOf(ORG_DOCUMENT_CATEGORIES);

/** Item do checklist como a tela e o motor usam (linha de core.edital_workspace_items). */
export type WorkspaceItem = {
  id: string;
  category: ItemCategory;
  title: string;
  description: string | null;
  requirement: ItemRequirement;
  origin: "edital" | "manual";
  sourceKey: string | null;
  evidence: string | null;
  status: ItemStatus;
  responsibleId: string | null;
  dueDate: string | null;
  charLimit: number | null;
  wordLimit: number | null;
  pageLimit: number | null;
  content: string | null;
  orgDocumentId: string | null;
  notes: string | null;
  position: number;
  updatedAt: string | null;
};

/** Documento do acervo (linha de core.org_documents). */
export type OrgDocument = {
  id: string;
  scope: OrgDocumentScope;
  projetoId: string | null;
  category: OrgDocumentCategory;
  title: string;
  filePath: string | null;
  fileName: string | null;
  externalUrl: string | null;
  validUntil: string | null;
  notes: string | null;
};

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const int = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0
    ? Math.round(number)
    : null;
};

export function toWorkspaceItem(row: Row): WorkspaceItem {
  return {
    id: String(row.id),
    category: isItemCategory(row.category) ? row.category : "other",
    title: text(row.title) ?? "Item",
    description: text(row.description),
    requirement: isItemRequirement(row.requirement) ? row.requirement : "mandatory",
    origin: row.origin === "edital" ? "edital" : "manual",
    sourceKey: text(row.source_key),
    evidence: text(row.evidence),
    status: isItemStatus(row.status) ? row.status : "pending",
    responsibleId: text(row.responsible_id),
    dueDate: text(row.due_date),
    charLimit: int(row.char_limit),
    wordLimit: int(row.word_limit),
    pageLimit: int(row.page_limit),
    content: typeof row.content === "string" ? row.content : null,
    orgDocumentId: text(row.org_document_id),
    notes: text(row.notes),
    position: typeof row.position === "number" ? row.position : 0,
    updatedAt: text(row.updated_at),
  };
}

export function toOrgDocument(row: Row): OrgDocument {
  return {
    id: String(row.id),
    scope: isOrgDocumentScope(row.scope) ? row.scope : "company",
    projetoId: text(row.projeto_id),
    category: isOrgDocumentCategory(row.category) ? row.category : "other",
    title: text(row.title) ?? "Documento",
    filePath: text(row.file_path),
    fileName: text(row.file_name),
    externalUrl: text(row.external_url),
    validUntil: text(row.valid_until),
    notes: text(row.notes),
  };
}
