import { describe, expect, it, vi } from "vitest";
import { createMemberDirect, createMemberSchema, describeCreateError } from "./create";

const ORG = "10000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-00000000000a";
const NEW_USER = "00000000-0000-4000-8000-0000000000c1";
const SECRET = "SenhaInicial123";

type Call = { table: string; op: string; payload?: unknown };

/** Cliente admin mínimo: registra chamadas; respostas por tabela. */
function stubAdmin(options: {
  profile?: { id: string } | null;
  membership?: { status: string } | null;
  insertError?: { code: string } | null;
  create?: { data: { user: { id: string } | null }; error: unknown };
}) {
  const calls: Call[] = [];
  const createUser = vi.fn(
    async () => options.create ?? { data: { user: { id: NEW_USER } }, error: null },
  );
  const deleteUser = vi.fn(async () => ({ error: null }));
  const from = (table: string) => {
    const call: Call = { table, op: "select" };
    calls.push(call);
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: table === "profiles" ? (options.profile ?? null) : (options.membership ?? null),
        error: null,
      }),
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return { eq: async () => ({ error: null }) };
      },
      insert: async (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return { error: options.insertError ?? null };
      },
    };
    return builder;
  };
  const admin = { from, auth: { admin: { createUser, deleteUser } } };
  return { admin: admin as never, calls, createUser, deleteUser };
}

const input = createMemberSchema.parse({
  full_name: "  Pessoa Nova  ",
  email: " Pessoa@Exemplo.com ",
  role: "editor",
  password: SECRET,
});

describe("criação direta de membro (ADM)", () => {
  it("valida nome, e-mail, perfil e a mesma política de senha do login", () => {
    expect(input).toMatchObject({ full_name: "Pessoa Nova", email: "pessoa@exemplo.com" });
    const weak = createMemberSchema.safeParse({ ...input, password: "curta" });
    expect(weak.success).toBe(false);
    expect(createMemberSchema.safeParse({ ...input, role: "dono" }).success).toBe(false);
    expect(createMemberSchema.safeParse({ ...input, full_name: " " }).success).toBe(false);
  });

  it("cria no Supabase Auth com e-mail confirmado e vínculo ATIVO na organização do ADM", async () => {
    const stub = stubAdmin({});
    const result = await createMemberDirect(stub.admin, { orgId: ORG, actorId: ADMIN, input });
    expect(result).toEqual({ ok: true, userId: NEW_USER });
    expect(stub.createUser).toHaveBeenCalledWith({
      email: "pessoa@exemplo.com",
      password: SECRET,
      email_confirm: true,
      user_metadata: { full_name: "Pessoa Nova" },
    });
    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert).toEqual({
      table: "memberships",
      op: "insert",
      payload: {
        org_id: ORG,
        user_id: NEW_USER,
        role: "editor",
        status: "active",
        invited_by: ADMIN,
      },
    });
    // A senha só vai para o Auth: nenhuma escrita em tabela a contém.
    const written = JSON.stringify(stub.calls.map((call) => call.payload ?? null));
    expect(written).not.toContain(SECRET);
  });

  it("não cria nem altera conta já existente (nenhuma senha trocada)", async () => {
    const member = stubAdmin({ profile: { id: "x" }, membership: { status: "active" } });
    const result = await createMemberDirect(member.admin, { orgId: ORG, actorId: ADMIN, input });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("já está na lista de membros");
    expect(member.createUser).not.toHaveBeenCalled();

    const other = stubAdmin({ profile: { id: "x" }, membership: null });
    const outside = await createMemberDirect(other.admin, { orgId: ORG, actorId: ADMIN, input });
    expect(!outside.ok && outside.error).toBe(
      "Já existe uma conta com este e-mail. Nenhuma senha foi alterada.",
    );
    expect(other.createUser).not.toHaveBeenCalled();
  });

  it("falha ao gravar o vínculo desfaz a conta criada", async () => {
    const stub = stubAdmin({ insertError: { code: "42501" } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await createMemberDirect(stub.admin, { orgId: ORG, actorId: ADMIN, input });
    expect(result.ok).toBe(false);
    expect(stub.deleteUser).toHaveBeenCalledWith(NEW_USER);
    // Logs só com códigos: sem senha nem e-mail.
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("pessoa@exemplo.com");
    errors.mockRestore();
  });

  it("erro do Auth vira mensagem com causa, sem registrar senha/e-mail", async () => {
    const stub = stubAdmin({
      create: { data: { user: null }, error: { code: "email_exists", status: 422 } },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await createMemberDirect(stub.admin, { orgId: ORG, actorId: ADMIN, input });
    expect(!result.ok && result.error).toBe(describeCreateError({ code: "email_exists" }));
    expect(JSON.stringify(errors.mock.calls)).not.toContain(SECRET);
    errors.mockRestore();
  });
});
