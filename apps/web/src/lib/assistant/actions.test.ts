import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, uuid } from "./test-support";

// Autorização e validação das server actions do Assistente (dados FICTÍCIOS, sem IA real).

const ORG = uuid(900);
const OTHER_ORG = uuid(901);
const EDITAL = uuid(2);
const WORKSPACE = uuid(1);

const state = vi.hoisted(() => ({
  role: "editor" as "viewer" | "editor" | "admin",
  orgId: "",
  db: null as null | ReturnType<typeof import("./test-support").fakeDb>,
  startRun: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async (minimum: string) => {
    const rank = { viewer: 0, editor: 1, admin: 2 } as const;
    if (rank[state.role] < rank[minimum as keyof typeof rank]) {
      throw Object.assign(new Error("NEXT_REDIRECT /sem-acesso"), {
        digest: "NEXT_REDIRECT;/sem-acesso?motivo=permissao",
      });
    }
    return {
      userId: uuid(20),
      email: "pessoa@exemplo.org",
      fullName: "Pessoa Fictícia",
      membership: { orgId: state.orgId, role: state.role, orgName: "Org", orgSlug: "org" },
    };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.db!.client }));
vi.mock("@/lib/assistant/run", async (original) => ({
  ...(await original<typeof import("./run")>()),
  startRun: state.startRun,
}));

const actions = await import("@/app/(app)/editais/[id]/trabalho/assistant-actions");

beforeEach(() => {
  state.role = "editor";
  state.orgId = ORG;
  state.db = fakeDb();
  state.db.tables.edital_workspaces = [{ id: WORKSPACE, org_id: ORG, edital_id: EDITAL }];
  state.startRun.mockReset();
  state.startRun.mockResolvedValue({ id: uuid(50), status: "queued" });
});

describe("server actions do Assistente LEP", () => {
  it("Equipe (viewer) não aciona o agente: é redirecionada sem executar nada", async () => {
    state.role = "viewer";
    await expect(
      actions.startAssistantRun(EDITAL, { kind: "full_analysis", request: null }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("permissao"),
    });
    await expect(actions.advanceAssistantRun(EDITAL, uuid(50))).rejects.toMatchObject({
      digest: expect.stringContaining("permissao"),
    });
    await expect(actions.decideProposal(EDITAL, uuid(60), "approve")).rejects.toMatchObject({
      digest: expect.stringContaining("permissao"),
    });
    expect(state.startRun).not.toHaveBeenCalled();
  });

  it("Diretoria (editor) inicia a análise na própria organização", async () => {
    const result = await actions.startAssistantRun(EDITAL, {
      kind: "full_analysis",
      request: null,
    });
    expect(result.ok).toBe(true);
    expect(state.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, workspaceId: WORKSPACE, editalId: EDITAL }),
      { kind: "full_analysis", request: null },
    );
  });

  it("isolamento: inscrição de outra organização não é encontrada", async () => {
    state.orgId = OTHER_ORG;
    const result = await actions.startAssistantRun(EDITAL, { kind: "chat", request: "Oi" });
    expect(result).toEqual({
      ok: false,
      error: "Crie a Área de Trabalho antes de usar o Assistente.",
    });
    expect(state.startRun).not.toHaveBeenCalled();
  });

  it("entradas inválidas são recusadas antes de qualquer acesso", async () => {
    expect(await actions.startAssistantRun("../x", { kind: "chat", request: "Oi" })).toEqual({
      ok: false,
      error: "Edital inválido.",
    });
    expect(
      await actions.startAssistantRun(EDITAL, { kind: "apagar_tudo" as never, request: "Oi" }),
    ).toEqual({ ok: false, error: "Pedido inválido." });
    expect(await actions.advanceAssistantRun(EDITAL, "nao-e-uuid")).toEqual({
      ok: false,
      error: "Execução inválida.",
    });
    expect(await actions.decideProposal(EDITAL, uuid(60), "talvez" as never)).toEqual({
      ok: false,
      error: "Decisão inválida.",
    });
  });

  it("proposta já decidida não é executada de novo", async () => {
    state.db!.tables.agent_actions = [
      {
        id: uuid(60),
        org_id: ORG,
        workspace_id: WORKSPACE,
        kind: "proposal",
        status: "approved",
        summary: "Marcar inscrição como enviada",
        proposal: { acao: "marcar_inscricao_enviada" },
      },
    ];
    expect(await actions.decideProposal(EDITAL, uuid(60), "approve")).toEqual({
      ok: false,
      error: "Esta proposta já foi decidida.",
    });
  });

  it("recusar uma proposta pendente registra a decisão e um aviso na conversa", async () => {
    state.db!.tables.assistant_conversations = [
      { id: uuid(70), org_id: ORG, workspace_id: WORKSPACE },
    ];
    state.db!.tables.agent_actions = [
      {
        id: uuid(60),
        org_id: ORG,
        workspace_id: WORKSPACE,
        run_id: uuid(50),
        kind: "proposal",
        status: "pending_confirmation",
        summary: "Marcar inscrição como enviada",
        proposal: { acao: "marcar_inscricao_enviada" },
      },
    ];
    const result = await actions.decideProposal(EDITAL, uuid(60), "decline");
    expect(result).toEqual({ ok: true, data: "Proposta recusada: Marcar inscrição como enviada" });
    expect(state.db!.tables.agent_actions[0]!.status).toBe("declined");
    expect(state.db!.tables.assistant_messages[0]!).toMatchObject({
      role: "notice",
      author_id: uuid(20),
    });
  });
});
