import { afterEach, describe, expect, it, vi } from "vitest";

/** Cliente mínimo: a 1ª consulta a memberships responde `first`; as seguintes, `legacy`. */
function fakeClient(first: unknown, legacy: unknown, rpc = vi.fn(async () => ({ error: null }))) {
  let membershipCalls = 0;
  const chain = (result: () => unknown) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result(),
    };
    return builder;
  };
  return {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "admin@exemplo.org" } } }) },
    from: (table: string) =>
      table === "profiles"
        ? chain(() => ({ data: { full_name: "Admin" }, error: null }))
        : chain(() => (membershipCalls++ === 0 ? first : legacy)),
  };
}

let client: ReturnType<typeof fakeClient>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<object>()),
  cache: (fn: unknown) => fn,
}));

const org = { id: "org", name: "LEP Filmes", slug: "lep" };

afterEach(() => vi.resetModules());

describe("getSession — status do vínculo", () => {
  it("antes da migração (coluna status ausente): admin continua entrando (comportamento anterior)", async () => {
    client = fakeClient(
      { data: null, error: { code: "42703", message: "column memberships.status does not exist" } },
      { data: { role: "admin", organizations: org }, error: null },
    );
    const { getSession } = await import("./session");
    expect((await getSession())?.membership).toMatchObject({ role: "admin", orgId: "org" });
  });

  it("vínculo ativo → acesso; suspenso → sem acesso, com o status informado", async () => {
    client = fakeClient(
      { data: { role: "admin", status: "active", organizations: org }, error: null },
      null,
    );
    const { getSession } = await import("./session");
    expect((await getSession())?.membership?.role).toBe("admin");

    vi.resetModules();
    client = fakeClient(
      { data: { role: "editor", status: "suspended", organizations: null }, error: null },
      null,
    );
    const again = await import("./session");
    expect(await again.getSession()).toMatchObject({
      membership: null,
      membershipStatus: "suspended",
    });
  });

  it("convite pendente é aceito ao entrar (RPC) e o acesso é liberado", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    client = fakeClient(
      { data: { role: "editor", status: "invited", organizations: null }, error: null },
      { data: { role: "editor", status: "active", organizations: org }, error: null },
      rpc,
    );
    const { getSession } = await import("./session");
    expect((await getSession())?.membership?.role).toBe("editor");
    expect(rpc).toHaveBeenCalledWith("accept_my_invitations");
  });
});
