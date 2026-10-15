import "server-only";

import type { Json } from "@lep/db";
import {
  isWorkspaceStatus,
  parseWorkspaceRules,
  toEdital,
  toOrgDocument,
  toWorkspaceItem,
  type Edital,
} from "@lep/funding";
import { syncChecklist } from "@/lib/editais/workspace-sync";
import { loadEditalPages } from "@/lib/editais/workspace-source";
import { loadProponent } from "@/lib/proponent";
import type { createClient } from "@/lib/supabase/server";
import { CONFIDENCE_VALUES, SOURCE_KINDS, type Confidence, type SourceKind } from "./evidence";
import {
  FINDING_KINDS,
  SEVERITIES,
  type ActionRecord,
  type AssistantItem,
  type AssistantStore,
  type FindingFields,
  type FindingRow,
  type ItemFields,
  type PagedEditalDocument,
  type WorkspaceRow,
} from "./store";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
const numberOrNull = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};

export function toAssistantItem(row: Row): AssistantItem {
  return {
    ...toWorkspaceItem(row),
    confidence: (CONFIDENCE_VALUES as readonly string[]).includes(String(row.confidence))
      ? (row.confidence as Confidence)
      : null,
    sourceKind: (SOURCE_KINDS as readonly string[]).includes(String(row.source_kind))
      ? (row.source_kind as SourceKind)
      : null,
    evidenceDocument: typeof row.evidence_document === "string" ? row.evidence_document : null,
    evidencePage: numberOrNull(row.evidence_page),
    evidenceSection: typeof row.evidence_section === "string" ? row.evidence_section : null,
    updatedVia: row.updated_via === "assistant" ? "assistant" : "user",
    aiSuggestion: typeof row.ai_suggestion === "string" ? row.ai_suggestion : null,
  };
}

export function toFinding(row: Row): FindingRow {
  return {
    id: String(row.id),
    kind: oneOf(FINDING_KINDS, row.kind, "observation"),
    dedupeKey: String(row.dedupe_key ?? ""),
    title: String(row.title ?? ""),
    detail: typeof row.detail === "string" ? row.detail : null,
    severity: oneOf(SEVERITIES, row.severity, "medium"),
    status: oneOf(["open", "resolved", "dismissed"] as const, row.status, "open"),
    confidence: oneOf(CONFIDENCE_VALUES, row.confidence, "inferred"),
    sourceKind: oneOf(SOURCE_KINDS, row.source_kind, "ai_inference"),
    evidence:
      row.evidence && typeof row.evidence === "object"
        ? (row.evidence as FindingRow["evidence"])
        : {},
    points: numberOrNull(row.points),
    itemId: typeof row.item_id === "string" ? row.item_id : null,
    createdVia: row.created_via === "user" ? "user" : "assistant",
    resolution: typeof row.resolution === "string" ? row.resolution : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/** Colunas do item a partir dos campos do agente (só os informados). */
function itemColumns(fields: ItemFields): Row {
  const map: [keyof ItemFields, string][] = [
    ["category", "category"],
    ["title", "title"],
    ["description", "description"],
    ["requirement", "requirement"],
    ["origin", "origin"],
    ["sourceKey", "source_key"],
    ["evidenceText", "evidence"],
    ["status", "status"],
    ["responsibleId", "responsible_id"],
    ["dueDate", "due_date"],
    ["charLimit", "char_limit"],
    ["wordLimit", "word_limit"],
    ["pageLimit", "page_limit"],
    ["content", "content"],
    ["orgDocumentId", "org_document_id"],
    ["notes", "notes"],
    ["confidence", "confidence"],
    ["sourceKind", "source_kind"],
    ["evidenceDocument", "evidence_document"],
    ["evidencePage", "evidence_page"],
    ["evidenceSection", "evidence_section"],
    ["analyzedAt", "analyzed_at"],
    ["aiSuggestion", "ai_suggestion"],
    ["aiSuggestionAt", "ai_suggestion_at"],
  ];
  const columns: Row = {};
  for (const [field, column] of map) {
    if (fields[field] !== undefined) columns[column] = fields[field];
  }
  return columns;
}

function findingColumns(fields: FindingFields): Row {
  const map: [keyof FindingFields, string][] = [
    ["kind", "kind"],
    ["dedupeKey", "dedupe_key"],
    ["title", "title"],
    ["detail", "detail"],
    ["severity", "severity"],
    ["status", "status"],
    ["confidence", "confidence"],
    ["sourceKind", "source_kind"],
    ["evidence", "evidence"],
    ["points", "points"],
    ["itemId", "item_id"],
    ["resolution", "resolution"],
  ];
  const columns: Row = {};
  for (const [field, column] of map) {
    if (fields[field] !== undefined) columns[column] = fields[field];
  }
  return columns;
}

/**
 * Loja do Assistente sobre o Supabase, com a sessão de quem acionou o agente: todas as
 * leituras/escritas passam pelo RLS e são filtradas pela organização e pela área de trabalho.
 * Itens/achados gravados aqui são marcados como alterados pelo assistente.
 */
export function createSupabaseAssistantStore(options: {
  supabase: Supabase;
  orgId: string;
  workspaceId: string;
  editalId: string;
  runId: string | null;
  step: number;
}): AssistantStore {
  const { supabase, orgId, workspaceId, editalId } = options;
  let editalCache: Edital | null = null;
  let pagesCache: { documents: PagedEditalDocument[]; notes: string[] } | null = null;

  const fail = (what: string, error: { code?: string; message?: string } | null) => {
    console.error(`Assistente: falha ao ${what}:`, error?.code, error?.message);
    throw new Error(`Não foi possível ${what}.`);
  };

  const store: AssistantStore = {
    orgId,

    async workspace(): Promise<WorkspaceRow> {
      const { data, error } = await supabase
        .from("edital_workspaces")
        .select("*")
        .eq("id", workspaceId)
        .eq("org_id", orgId)
        .single();
      if (error || !data) fail("ler a área de trabalho", error);
      return {
        id: data!.id,
        editalId: String(data!.edital_id),
        projetoId: data!.projeto_id,
        status: isWorkspaceStatus(data!.status) ? data!.status : "preparing",
        requestedAmount: numberOrNull(data!.requested_amount),
        totalBudget: numberOrNull(data!.total_budget),
        counterpartAmount: numberOrNull(data!.counterpart_amount),
        notes: data!.notes,
        rules: parseWorkspaceRules(data!.rules),
        rulesExtractedAt: data!.rules_extracted_at,
      };
    },

    async edital() {
      if (editalCache) return editalCache;
      const { data, error } = await supabase
        .from("editais")
        .select("*")
        .eq("id", editalId)
        .eq("org_id", orgId)
        .single();
      if (error || !data) fail("ler o edital", error);
      editalCache = toEdital(data!);
      return editalCache;
    },

    proponent: () => loadProponent(supabase, orgId),

    async production() {
      const workspace = await store.workspace();
      if (!workspace.projetoId) return null;
      const { data } = await supabase
        .from("projetos")
        .select("id, title, format, genre, stage, budget, synopsis")
        .eq("id", workspace.projetoId)
        .eq("org_id", orgId)
        .maybeSingle();
      return data
        ? { ...data, budget: numberOrNull(data.budget), synopsis: data.synopsis ?? null }
        : null;
    },

    async projects() {
      const { data } = await supabase
        .from("projetos")
        .select("id, title")
        .eq("org_id", orgId)
        .order("title");
      return data ?? [];
    },

    async members() {
      const { data } = await supabase
        .from("memberships")
        .select("user_id, profiles!memberships_user_id_fkey ( id, full_name, email )")
        .eq("org_id", orgId)
        .eq("status", "active");
      return (data ?? [])
        .map((row) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          return profile
            ? { id: profile.id, name: profile.full_name ?? profile.email ?? "Membro" }
            : null;
        })
        .filter((member): member is { id: string; name: string } => member !== null);
    },

    async items() {
      const { data, error } = await supabase
        .from("edital_workspace_items")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("org_id", orgId)
        .order("position", { ascending: true });
      if (error) fail("ler o checklist", error);
      return (data ?? []).map((row) => toAssistantItem(row));
    },

    async insertItem(fields) {
      const { data: last } = await supabase
        .from("edital_workspace_items")
        .select("position")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await supabase
        .from("edital_workspace_items")
        .insert({
          ...(itemColumns(fields) as Record<string, never>),
          title: fields.title ?? "Item",
          org_id: orgId,
          workspace_id: workspaceId,
          position: (last?.position ?? 0) + 1,
          updated_via: "assistant",
        })
        .select("*")
        .single();
      if (error || !data) fail("criar o item", error);
      return toAssistantItem(data!);
    },

    async updateItem(id, fields) {
      const { data, error } = await supabase
        .from("edital_workspace_items")
        .update({ ...(itemColumns(fields) as Record<string, never>), updated_via: "assistant" })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (error) fail("atualizar o item", error);
      if (!data) throw new Error("Item não encontrado nesta inscrição.");
      return toAssistantItem(data);
    },

    async documents() {
      const { data } = await supabase
        .from("org_documents")
        .select("*")
        .eq("org_id", orgId)
        .order("title");
      return (data ?? []).map((row) => toOrgDocument(row));
    },

    async findings() {
      const { data, error } = await supabase
        .from("workspace_findings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      if (error) fail("ler os achados", error);
      return (data ?? []).map((row) => toFinding(row));
    },

    async insertFinding(fields) {
      const { data, error } = await supabase
        .from("workspace_findings")
        .insert({
          ...(findingColumns(fields) as Record<string, never>),
          kind: fields.kind,
          dedupe_key: fields.dedupeKey,
          title: fields.title,
          org_id: orgId,
          workspace_id: workspaceId,
          created_via: "assistant",
          run_id: options.runId,
          evidence: (fields.evidence ?? {}) as Json,
        })
        .select("*")
        .single();
      if (error || !data) fail("registrar o achado", error);
      return toFinding(data!);
    },

    async updateFinding(id, fields) {
      const { data, error } = await supabase
        .from("workspace_findings")
        .update({
          ...(findingColumns(fields) as Record<string, never>),
          ...(fields.evidence ? { evidence: fields.evidence as Json } : {}),
          run_id: options.runId,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (error) fail("atualizar o achado", error);
      if (!data) throw new Error("Achado não encontrado nesta inscrição.");
      return toFinding(data);
    },

    async updateWorkspace(fields) {
      const columns: Row = {};
      if (fields.projetoId !== undefined) columns.projeto_id = fields.projetoId;
      if (fields.requestedAmount !== undefined) columns.requested_amount = fields.requestedAmount;
      if (fields.totalBudget !== undefined) columns.total_budget = fields.totalBudget;
      if (fields.counterpartAmount !== undefined)
        columns.counterpart_amount = fields.counterpartAmount;
      if (fields.status !== undefined) columns.status = fields.status;
      if (fields.notes !== undefined) columns.notes = fields.notes;
      const { error } = await supabase
        .from("edital_workspaces")
        .update(columns as Record<string, never>)
        .eq("id", workspaceId)
        .eq("org_id", orgId);
      if (error) fail("atualizar a inscrição", error);
    },

    async editalPages() {
      if (pagesCache) return pagesCache;
      const pages = await loadEditalPages(supabase, orgId, await store.edital(), { persist: true });
      pagesCache = { documents: pages.documents, notes: pages.notes };
      return pagesCache;
    },

    async pendingChanges() {
      const { count } = await supabase
        .from("edital_changes")
        .select("id", { count: "exact", head: true })
        .eq("edital_id", editalId)
        .eq("org_id", orgId)
        .eq("status", "pending");
      return count ?? 0;
    },

    async latestEditalDocumentAt() {
      const { data } = await supabase
        .from("edital_documents")
        .select("created_at")
        .eq("edital_id", editalId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0]?.created_at ?? null;
    },

    async syncChecklist() {
      const result = await syncChecklist(supabase, orgId, editalId, workspaceId);
      pagesCache = null;
      return result;
    },

    async recordAction(action: ActionRecord) {
      if (!options.runId) return;
      const { error } = await supabase.from("agent_actions").insert({
        org_id: orgId,
        run_id: options.runId,
        workspace_id: workspaceId,
        step: options.step,
        tool: action.tool,
        kind: action.kind,
        status: action.status,
        summary: action.summary.slice(0, 1000),
        input: (action.input ?? {}) as Json,
        before_data: (action.before ?? null) as Json,
        after_data: (action.after ?? null) as Json,
        target_table: action.targetTable ?? null,
        target_id: action.targetId ?? null,
        evidence: (action.evidence ?? null) as Json,
        confidence: action.confidence ?? null,
        proposal: (action.proposal ?? null) as Json,
        error: action.error ? action.error.slice(0, 2000) : null,
      });
      if (error) fail("registrar a auditoria", error);
    },

    async recentActions(limit) {
      const { data } = await supabase
        .from("agent_actions")
        .select("tool, status, summary, created_at")
        .eq("workspace_id", workspaceId)
        .eq("org_id", orgId)
        .neq("kind", "read")
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map((row) => ({
        tool: row.tool,
        status: row.status,
        summary: row.summary,
        createdAt: row.created_at,
        via: "assistant" as const,
      }));
    },
  };
  return store;
}
