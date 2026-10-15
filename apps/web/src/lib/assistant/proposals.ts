/**
 * Ações que o Assistente LEP só PROPÕE (ADR-0027): ficam pendentes em core.agent_actions e
 * só são executadas — por código determinístico, não pelo modelo — depois da aprovação de
 * Diretoria/ADM. Ações fora da plataforma (e-mail, inscrição externa, pagamento) não existem
 * aqui de propósito: o agente apenas orienta a pessoa.
 */
import type { AssistantStore } from "./store";

export class ProposalError extends Error {}

export type Proposal = {
  acao: string;
  item_id: string | null;
  documento_id: string | null;
  campo: "valor_solicitado" | "orcamento_total" | "contrapartida" | null;
  valor: number | null;
  descricao: string;
  motivo: string;
};

type ProposalAction = {
  label: string;
  /** Conferências antes de registrar a proposta e de novo antes de executar. */
  validate: (store: AssistantStore, proposal: Proposal) => Promise<void>;
  execute: (store: AssistantStore, proposal: Proposal) => Promise<string>;
};

async function requireItem(store: AssistantStore, proposal: Proposal) {
  if (!proposal.item_id) throw new ProposalError("Informe o item (item_id).");
  const item = (await store.items()).find((entry) => entry.id === proposal.item_id);
  if (!item) throw new ProposalError("Item não encontrado nesta inscrição.");
  return item;
}

const FIELD_COLUMNS = {
  valor_solicitado: "requestedAmount",
  orcamento_total: "totalBudget",
  contrapartida: "counterpartAmount",
} as const;

export const PROPOSAL_ACTIONS: Record<string, ProposalAction> = {
  marcar_inscricao_enviada: {
    label: "marcar a inscrição como enviada/submetida",
    validate: async () => {},
    execute: async (store) => {
      await store.updateWorkspace({ status: "submitted" });
      return "Inscrição marcada como enviada.";
    },
  },
  arquivar_inscricao: {
    label: "arquivar a inscrição",
    validate: async () => {},
    execute: async (store) => {
      await store.updateWorkspace({ status: "archived" });
      return "Inscrição arquivada.";
    },
  },
  substituir_texto: {
    label: "substituir o texto da equipe pela sugestão da IA",
    validate: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      if (!item.aiSuggestion?.trim())
        throw new ProposalError("O item não tem sugestão da IA registrada.");
    },
    execute: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      await store.updateItem(item.id, {
        content: item.aiSuggestion,
        aiSuggestion: null,
        aiSuggestionAt: null,
      });
      return `Texto de "${item.title}" substituído pela sugestão.`;
    },
  },
  substituir_documento: {
    label: "trocar o documento do acervo vinculado a um item",
    validate: async (store, proposal) => {
      await requireItem(store, proposal);
      if (!proposal.documento_id)
        throw new ProposalError("Informe o novo documento (documento_id).");
      if (!(await store.documents()).some((doc) => doc.id === proposal.documento_id)) {
        throw new ProposalError("Documento não encontrado no acervo.");
      }
    },
    execute: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      await store.updateItem(item.id, { orgDocumentId: proposal.documento_id });
      return `Documento de "${item.title}" substituído.`;
    },
  },
  remover_documento_vinculado: {
    label: "desvincular o documento do acervo de um item",
    validate: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      if (!item.orgDocumentId) throw new ProposalError("O item não tem documento vinculado.");
    },
    execute: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      await store.updateItem(item.id, { orgDocumentId: null });
      return `Documento desvinculado de "${item.title}".`;
    },
  },
  alterar_dado_inscricao: {
    label:
      "alterar um valor já preenchido da inscrição (solicitado, orçamento total, contrapartida)",
    validate: async (_store, proposal) => {
      if (!proposal.campo || proposal.valor === null)
        throw new ProposalError("Informe campo e valor.");
    },
    execute: async (store, proposal) => {
      if (!proposal.campo || proposal.valor === null)
        throw new ProposalError("Informe campo e valor.");
      await store.updateWorkspace({ [FIELD_COLUMNS[proposal.campo]]: proposal.valor });
      return `Campo ${proposal.campo} alterado.`;
    },
  },
  marcar_nao_se_aplica: {
    label: "marcar como “não se aplica” um item que a equipe concluiu ou editou",
    validate: async (store, proposal) => {
      await requireItem(store, proposal);
    },
    execute: async (store, proposal) => {
      const item = await requireItem(store, proposal);
      await store.updateItem(item.id, { status: "not_applicable" });
      return `"${item.title}" marcado como não se aplica.`;
    },
  },
};

export async function validateProposal(store: AssistantStore, proposal: Proposal): Promise<void> {
  const action = PROPOSAL_ACTIONS[proposal.acao];
  if (!action) throw new ProposalError("Ação não permitida.");
  await action.validate(store, proposal);
}

/** Executa uma proposta APROVADA (revalida antes — o estado pode ter mudado). */
export async function executeProposal(store: AssistantStore, proposal: Proposal): Promise<string> {
  const action = PROPOSAL_ACTIONS[proposal.acao];
  if (!action) throw new ProposalError("Ação não permitida.");
  await action.validate(store, proposal);
  return action.execute(store, proposal);
}

export function parseProposal(value: unknown): Proposal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.acao !== "string" || !(record.acao in PROPOSAL_ACTIONS)) return null;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : null);
  const campo = text("campo");
  return {
    acao: record.acao,
    item_id: text("item_id"),
    documento_id: text("documento_id"),
    campo:
      campo === "valor_solicitado" || campo === "orcamento_total" || campo === "contrapartida"
        ? campo
        : null,
    valor: typeof record.valor === "number" ? record.valor : null,
    descricao: text("descricao") ?? "",
    motivo: text("motivo") ?? "",
  };
}
