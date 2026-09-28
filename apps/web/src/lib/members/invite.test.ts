import { describe, expect, it, vi } from "vitest";
import {
  describeAuthError,
  inviteMember,
  inviteRedirectUrl,
  inviteSchema,
  reactivationStatus,
  resendInvite,
} from "./invite";

const ORG = "10000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-00000000000a";

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

/** Cliente admin mínimo: registra as chamadas e devolve respostas por tabela. */
function stubAdmin(responses: {
  profiles?: unknown;
  memberships?: unknown;
  insertError?: { code: string } | null;
  invite?: { data: { user: { id: string } | null }; error: unknown };
}) {
  const calls: Call[] = [];
  const invite = vi.fn(async () => responses.invite ?? { data: { user: null }, error: null });
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      maybeSingle: async () => ({
        data: (responses as Record<string, unknown>)[table] ?? null,
        error: null,
      }),
      insert: async (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return { error: responses.insertError ?? null };
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from, auth: { admin: { inviteUserByEmail: invite } } } as any;
  return { client, calls, invite };
}

const input = inviteSchema.parse({ email: " Pessoa@Exemplo.org ", full_name: "", role: "editor" });
const redirectTo = inviteRedirectUrl("https://app.exemplo.org/");

describe("inviteSchema", () => {
  it("normaliza e-mail e aceita os três perfis", () => {
    expect(input).toEqual({ email: "pessoa@exemplo.org", full_name: undefined, role: "editor" });
    for (const role of ["admin", "editor", "viewer"]) {
      expect(inviteSchema.safeParse({ email: "a@b.org", full_name: "", role }).success).toBe(true);
    }
  });

  it("recusa e-mail inválido e perfil desconhecido; não existe campo de senha", () => {
    expect(
      inviteSchema.safeParse({ email: "nao-e-email", full_name: "", role: "viewer" }).success,
    ).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.org", full_name: "", role: "owner" }).success).toBe(
      false,
    );
    const parsed = inviteSchema.parse({
      email: "a@b.org",
      full_name: "",
      role: "viewer",
      password: "x",
    });
    expect(parsed).not.toHaveProperty("password");
  });
});

describe("inviteMember", () => {
  it("pessoa nova: convite do Supabase Auth + vínculo 'convidado' na organização do admin", async () => {
    const { client, calls, invite } = stubAdmin({
      invite: { data: { user: { id: "user-novo" } }, error: null },
    });
    const result = await inviteMember(client, { orgId: ORG, actorId: ADMIN, input, redirectTo });
    expect(result.ok).toBe(true);
    expect(invite).toHaveBeenCalledWith("pessoa@exemplo.org", {
      data: undefined,
      redirectTo: "https://app.exemplo.org/conta/senha",
    });
    expect(calls.find((call) => call.op === "insert")).toMatchObject({
      table: "memberships",
      payload: {
        org_id: ORG,
        user_id: "user-novo",
        role: "editor",
        status: "invited",
        invited_by: ADMIN,
      },
    });
  });

  it("pessoa que já tem conta: só cria o vínculo, sem e-mail", async () => {
    const { client, calls, invite } = stubAdmin({ profiles: { id: "user-existente" } });
    const result = await inviteMember(client, { orgId: ORG, actorId: ADMIN, input, redirectTo });
    expect(result).toMatchObject({ ok: true });
    expect(invite).not.toHaveBeenCalled();
    expect(calls.find((call) => call.op === "insert")?.payload).toMatchObject({
      user_id: "user-existente",
      status: "invited",
    });
    // A busca de vínculo existente filtra a organização do admin.
    expect(
      calls.find((call) => call.table === "memberships" && call.op === "select")?.filters,
    ).toContainEqual(["org_id", ORG]);
  });

  it("já é membro: não duplica", async () => {
    const { client, calls } = stubAdmin({
      profiles: { id: "user-existente" },
      memberships: { status: "suspended" },
    });
    const result = await inviteMember(client, { orgId: ORG, actorId: ADMIN, input, redirectTo });
    expect(result).toEqual({
      ok: false,
      error: "Essa pessoa já está na lista de membros (status: suspenso).",
    });
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });

  it("falha de e-mail (SMTP/limite) vira mensagem com a correção, sem gravar vínculo", async () => {
    const { client, calls } = stubAdmin({
      invite: { data: { user: null }, error: { status: 429, code: "over_email_send_rate_limit" } },
    });
    const result = await inviteMember(client, { orgId: ORG, actorId: ADMIN, input, redirectTo });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("SMTP");
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });
});

describe("resendInvite", () => {
  it("reenvia só convites pendentes da própria organização", async () => {
    const { client, calls, invite } = stubAdmin({
      memberships: {
        id: "m1",
        status: "invited",
        user_id: "u1",
        profiles: { email: "p@exemplo.org" },
      },
    });
    const result = await resendInvite(client, { orgId: ORG, membershipId: "m1", redirectTo });
    expect(result).toEqual({ ok: true, message: "Convite reenviado." });
    expect(invite).toHaveBeenCalledWith("p@exemplo.org", { redirectTo });
    expect(calls[0]!.filters).toEqual([
      ["id", "m1"],
      ["org_id", ORG],
    ]);
    expect(calls.find((call) => call.op === "update")?.filters).toContainEqual(["org_id", ORG]);
  });

  it("vínculo ativo não recebe convite", async () => {
    const { client, invite } = stubAdmin({
      memberships: {
        id: "m1",
        status: "active",
        user_id: "u1",
        profiles: { email: "p@exemplo.org" },
      },
    });
    const result = await resendInvite(client, { orgId: ORG, membershipId: "m1", redirectTo });
    expect(result.ok).toBe(false);
    expect(invite).not.toHaveBeenCalled();
  });

  it("pessoa que já confirmou o e-mail: explica que o acesso sai no próximo login", async () => {
    const { client } = stubAdmin({
      memberships: {
        id: "m1",
        status: "invited",
        user_id: "u1",
        profiles: { email: "p@exemplo.org" },
      },
      invite: { data: { user: null }, error: { status: 422, code: "email_exists" } },
    });
    const result = await resendInvite(client, { orgId: ORG, membershipId: "m1", redirectTo });
    expect(!result.ok && result.error).toContain("próximo login");
  });
});

describe("regras auxiliares", () => {
  it("reativação: quem nunca entrou volta a ser convite", () => {
    expect(reactivationStatus(null)).toBe("invited");
    expect(reactivationStatus("2026-09-01T00:00:00Z")).toBe("active");
  });

  it("erros do Auth nunca repetem o e-mail", () => {
    expect(
      describeAuthError({ code: "unexpected_failure", message: "Error sending invite email" }),
    ).toContain("SMTP");
    expect(describeAuthError({ code: "x" })).toContain("código x");
  });
});
