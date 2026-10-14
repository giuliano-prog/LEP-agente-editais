/**
 * Validação dos formulários da Área de Trabalho do Edital (ADR-0026).
 * Funções puras: o servidor confia só no que passa por aqui (e o banco ainda
 * confere tudo de novo pelos CHECK e pelas políticas RLS).
 */
import {
  isItemCategory,
  isItemRequirement,
  isItemStatus,
  isOrgDocumentCategory,
  isOrgDocumentScope,
  isWorkspaceStatus,
  parseMoney,
} from "@lep/funding";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const optional = (form: FormData, key: string, max: number) => {
  const value = str(form, key);
  return value ? value.slice(0, max) : null;
};
const optionalUuid = (form: FormData, key: string) => {
  const value = str(form, key);
  return UUID.test(value) ? value : null;
};
const optionalDate = (form: FormData, key: string) => {
  const value = str(form, key);
  return DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
};
const optionalLimit = (form: FormData, key: string): number | null | "invalid" => {
  const value = str(form, key).replace(/\./g, "");
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 1_000_000 ? number : "invalid";
};

export type WorkspaceUpdate = {
  projeto_id: string | null;
  status: string;
  requested_amount: number | null;
  total_budget: number | null;
  counterpart_amount: number | null;
  notes: string | null;
};

/** Produção, status e valores da inscrição. Só altera os campos presentes no formulário. */
export function parseWorkspaceForm(form: FormData): FormResult<Partial<WorkspaceUpdate>> {
  const value: Partial<WorkspaceUpdate> = {};
  if (form.has("projeto_id")) value.projeto_id = optionalUuid(form, "projeto_id");
  if (form.has("status")) {
    const status = str(form, "status");
    if (!isWorkspaceStatus(status)) return { ok: false, error: "Status inválido." };
    value.status = status;
  }
  for (const key of ["requested_amount", "total_budget", "counterpart_amount"] as const) {
    if (!form.has(key)) continue;
    const amount = parseMoney(str(form, key));
    if (Number.isNaN(amount) || (amount !== null && amount < 0)) {
      return { ok: false, error: "Valor inválido: use o formato 1.500.000,00." };
    }
    value[key] = amount;
  }
  if (form.has("notes")) value.notes = optional(form, "notes", 5000);
  return { ok: true, value };
}

export type ItemFields = {
  category?: string;
  title?: string;
  description?: string | null;
  requirement?: string;
  status?: string;
  responsible_id?: string | null;
  due_date?: string | null;
  char_limit?: number | null;
  word_limit?: number | null;
  page_limit?: number | null;
  content?: string | null;
  org_document_id?: string | null;
  notes?: string | null;
};

/** Campos de um item do checklist (novo ou edição). `requireTitle` vale para itens novos. */
export function parseItemForm(form: FormData, requireTitle = false): FormResult<ItemFields> {
  const value: ItemFields = {};
  if (form.has("title") || requireTitle) {
    const title = str(form, "title");
    if (title.length < 2 || title.length > 300) {
      return { ok: false, error: "Informe um título (2 a 300 caracteres)." };
    }
    value.title = title;
  }
  if (form.has("category")) {
    const category = str(form, "category");
    if (!isItemCategory(category)) return { ok: false, error: "Categoria inválida." };
    value.category = category;
  }
  if (form.has("requirement")) {
    const requirement = str(form, "requirement");
    if (!isItemRequirement(requirement)) return { ok: false, error: "Exigência inválida." };
    value.requirement = requirement;
  }
  if (form.has("status")) {
    const status = str(form, "status");
    if (!isItemStatus(status)) return { ok: false, error: "Status inválido." };
    value.status = status;
  }
  if (form.has("description")) value.description = optional(form, "description", 2000);
  if (form.has("responsible_id")) value.responsible_id = optionalUuid(form, "responsible_id");
  if (form.has("due_date")) value.due_date = optionalDate(form, "due_date");
  if (form.has("org_document_id")) value.org_document_id = optionalUuid(form, "org_document_id");
  if (form.has("notes")) value.notes = optional(form, "notes", 2000);
  if (form.has("content")) {
    const content = form.get("content");
    const text = typeof content === "string" ? content.replace(/\r\n/g, "\n") : "";
    if (text.length > 50_000) return { ok: false, error: "Texto acima de 50.000 caracteres." };
    value.content = text.trim() ? text : null;
  }
  for (const key of ["char_limit", "word_limit", "page_limit"] as const) {
    if (!form.has(key)) continue;
    const limit = optionalLimit(form, key);
    if (limit === "invalid") return { ok: false, error: "Limite inválido: use um número inteiro." };
    value[key] = limit;
  }
  return { ok: true, value };
}

export type OrgDocumentFields = {
  scope: string;
  projeto_id: string | null;
  category: string;
  title: string;
  external_url: string | null;
  valid_until: string | null;
  notes: string | null;
};

export function parseOrgDocumentForm(form: FormData): FormResult<OrgDocumentFields> {
  const title = str(form, "title");
  if (title.length < 2 || title.length > 200) {
    return { ok: false, error: "Informe o nome do documento (2 a 200 caracteres)." };
  }
  const scope = str(form, "scope") || "company";
  if (!isOrgDocumentScope(scope)) return { ok: false, error: "Escopo inválido." };
  const category = str(form, "category") || "other";
  if (!isOrgDocumentCategory(category)) return { ok: false, error: "Categoria inválida." };
  const projetoId = optionalUuid(form, "projeto_id");
  if (scope === "production" && !projetoId) {
    return { ok: false, error: "Escolha a produção deste documento." };
  }
  const url = str(form, "external_url");
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "Link inválido: use um endereço http(s)." };
  }
  return {
    ok: true,
    value: {
      scope,
      projeto_id: scope === "production" ? projetoId : null,
      category,
      title,
      external_url: url ? url.slice(0, 2000) : null,
      valid_until: optionalDate(form, "valid_until"),
      notes: optional(form, "notes", 2000),
    },
  };
}

/** Caminho do arquivo do acervo enviado pelo navegador: <org_id>/acervo/<uuid>.pdf */
export function acervoPath(orgId: string, fileId: string) {
  return `${orgId}/acervo/${fileId}.pdf`;
}

export function isValidAcervoPath(orgId: string, path: string) {
  return (
    UUID.test(orgId) &&
    new RegExp(
      `^${orgId}/acervo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`,
    ).test(path)
  );
}
