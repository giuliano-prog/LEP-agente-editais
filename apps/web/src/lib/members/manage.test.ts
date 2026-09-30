import { describe, expect, it, vi } from "vitest";
import { changeMemberRole, removeMember } from "./manage";

const ORG = "org-a";
const ADMIN = "u-admin";
const TARGET = "u-alvo";

type Op = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown };
type Responder = (op: Op) => { data: unknown; error: unknown };

/** Cliente mínimo encadeável: registra operações e responde conforme `respond`. */
function stub(respond: Responder) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, op: "select", filters: {} };
    ops.push(op);
    const result = () => Promise.resolve(respond(op));
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (payload: unknown) => ((op.op = "update"), (op.payload = payload), builder),
      delete: () => ((op.op = "delete"), builder),
      eq: (column: string, value: unknown) => ((op.filters[column] = value), builder),
      neq: (column: string, value: unknown) => ((op.filters[`not.${column}`] = value), builder),
      limit: () => builder,
      maybeSingle: result,
      then: (resolve: (value: unknown) => unknown) => result().then(resolve),
    };
    return builder;
  };
  const deleteUser = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const list = vi.fn(async () => ({ data: [{ name: "foto.png" }], error: null }));
  const client = {
    from,
    auth: { admin: { deleteUser } },
    storage: { from: () => ({ list, remove }) },
  };
  return { client: client as never, ops, deleteUser, remove };
}

const ok = (data: unknown) => ({ data, error: null });

describe("trocar perfil de acesso", () => {
  it("Equipe → Diretoria grava o papel no vínculo da organização (sessão do ADM)", async () => {
    const session = stub(() => ok([{ id: "m1" }]));
    const result = await changeMemberRole(session.client, {
      orgId: ORG,
      actorId: ADMIN,
      userId: TARGET,
      role: "editor",
    });
    expect(result).toEqual({ ok: true, message: "Perfil alterado para Diretoria." });
    expect(session.ops[0]).toMatchObject({
      table: "memberships",
      op: "update",
      payload: { role: "editor" },
      filters: { org_id: ORG, user_id: TARGET },
    });
  });

  it("ninguém altera o próprio perfil; RLS sem linha = sem permissão; regra do banco aparece", async () => {
    const session = stub(() => ok([]));
    expect(
      await changeMemberRole(session.client, {
        orgId: ORG,
        actorId: ADMIN,
        userId: ADMIN,
        role: "viewer",
      }),
    ).toEqual({ ok: false, error: "Você não pode alterar o próprio perfil de acesso." });
    expect(session.ops).toHaveLength(0);
    expect(
      await changeMemberRole(session.client, {
        orgId: ORG,
        actorId: ADMIN,
        userId: TARGET,
        role: "viewer",
      }),
    ).toEqual({ ok: false, error: "Sem permissão para alterar este membro." });
    const guarded = stub(() => ({
      data: null,
      error: {
        code: "23514",
        message: "A organização precisa manter pelo menos um administrador ativo.",
      },
    }));
    const result = await changeMemberRole(guarded.client, {
      orgId: ORG,
      actorId: ADMIN,
      userId: TARGET,
      role: "viewer",
    });
    expect(!result.ok && result.error).toContain("pelo menos um administrador ativo");
  });
});

describe("excluir usuário", () => {
  const params = { orgId: ORG, actorId: ADMIN, userId: TARGET, confirmation: "EXCLUIR" };

  it("exige confirmação digitada e bloqueia a autoexclusão, sem tocar em nada", async () => {
    const session = stub(() => ok(null));
    const admin = stub(() => ok(null));
    expect(
      await removeMember(session.client, admin.client, { ...params, confirmation: "sim" }),
    ).toEqual({ ok: false, error: "Digite EXCLUIR para confirmar a exclusão." });
    expect(await removeMember(session.client, admin.client, { ...params, userId: ADMIN })).toEqual({
      ok: false,
      error: "Você não pode excluir o próprio usuário.",
    });
    expect(session.ops).toHaveLength(0);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("não exclui o último ADM ativo (antes de qualquer remoção)", async () => {
    const session = stub((op) =>
      op.filters["not.user_id"] ? ok([]) : ok({ id: "m1", role: "admin", status: "active" }),
    );
    const admin = stub(() => ok([]));
    const result = await removeMember(session.client, admin.client, params);
    expect(result).toEqual({
      ok: false,
      error: "A organização precisa manter pelo menos um administrador ativo.",
    });
    expect(session.ops.some((op) => op.op === "delete")).toBe(false);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("remove o vínculo e apaga a conta (e a foto) quando não há outra organização", async () => {
    const session = stub((op) =>
      op.op === "delete" ? ok([{ id: "m1" }]) : ok({ id: "m1", role: "viewer", status: "active" }),
    );
    const admin = stub(() => ok([]));
    const result = await removeMember(session.client, admin.client, params);
    expect(result).toEqual({ ok: true, message: "Usuário excluído permanentemente." });
    expect(session.ops.find((op) => op.op === "delete")?.filters).toEqual({
      id: "m1",
      org_id: ORG,
    });
    expect(admin.remove).toHaveBeenCalledWith([`${TARGET}/foto.png`]);
    expect(admin.deleteUser).toHaveBeenCalledWith(TARGET);
  });

  it("vínculo em outra organização: remove só o acesso desta e mantém a conta", async () => {
    const session = stub((op) =>
      op.op === "delete" ? ok([{ id: "m1" }]) : ok({ id: "m1", role: "editor", status: "active" }),
    );
    const admin = stub(() => ok([{ id: "m-outra" }]));
    const result = await removeMember(session.client, admin.client, params);
    expect(result.ok && result.message).toContain("continua em outra organização");
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});
