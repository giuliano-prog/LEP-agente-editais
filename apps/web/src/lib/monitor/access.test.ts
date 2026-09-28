import { afterEach, describe, expect, it, vi } from "vitest";

const ORG = "10000000-0000-4000-8000-00000000000a";

type CountResult = { count: number | null; error: { message: string; code?: string } | null };

/** Cliente mínimo: from().select().eq().eq() → { count, error }, registrando os filtros. */
function stubClient(result: CountResult) {
  const filters: [string, unknown][] = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    then: (resolve: (value: CountResult) => unknown) => resolve(result),
  };
  return { client: { from: () => builder }, filters };
}

let engine = stubClient({ count: 0, error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => engine.client,
  isAdminClientConfigured: () => Boolean(process.env.SUPABASE_SECRET_KEY),
}));

// JWT legado fictício (assinatura irrelevante: só o papel é lido).
const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;

async function check(userCount: number, key: string | undefined) {
  if (key === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = key;
  const { checkMonitorAccess } = await import("./access");
  const user = stubClient({ count: userCount, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { access: await checkMonitorAccess(user.client as any, ORG), user };
}

afterEach(() => {
  delete process.env.SUPABASE_SECRET_KEY;
});

describe("checkMonitorAccess", () => {
  it("chave correta: interface e motor enxergam as mesmas fontes ativas", async () => {
    engine = stubClient({ count: 3, error: null });
    const { access, user } = await check(3, "sb_secret_ficticia");
    expect(access).toEqual({
      keyKind: "secret",
      userActive: 3,
      engineActive: 3,
      ok: true,
      problem: null,
    });
    // As duas contagens filtram a organização e só fontes ativas.
    expect(user.filters).toEqual([
      ["org_id", ORG],
      ["active", true],
    ]);
    expect(engine.filters).toEqual([
      ["org_id", ORG],
      ["active", true],
    ]);
  });

  it("divergência: aponta as duas contagens em vez de 'nenhuma fonte ativa'", async () => {
    engine = stubClient({ count: 0, error: null });
    const { access } = await check(2, jwt("service_role"));
    expect(access.ok).toBe(false);
    expect(access.keyKind).toBe("service_role_jwt");
    expect(access.problem).toContain(
      "a interface mostra 2 fonte(s) ativa(s), mas o motor enxerga 0",
    );
  });

  it("chave publishable: não consulta o motor e explica o erro", async () => {
    engine = stubClient({ count: 99, error: null });
    const { access } = await check(2, "sb_publishable_ficticia");
    expect(access).toMatchObject({ keyKind: "publishable", engineActive: null, ok: false });
    expect(access.problem).toContain("publishable");
    expect(engine.filters).toEqual([]);
  });

  it("chave anon legada é recusada", async () => {
    const { access } = await check(1, jwt("anon"));
    expect(access).toMatchObject({ keyKind: "anon_jwt", ok: false });
  });

  it("chave ausente", async () => {
    const { access } = await check(1, undefined);
    expect(access).toMatchObject({ keyKind: "missing", ok: false });
    expect(access.problem).toContain("não está configurada");
  });

  it("erro do motor (ex.: chave de outro projeto) vira mensagem clara", async () => {
    engine = stubClient({ count: null, error: { message: "Invalid API key" } });
    const { access } = await check(1, "sb_secret_de_outro_projeto");
    expect(access.ok).toBe(false);
    expect(access.problem).toContain("O motor não conseguiu ler as fontes");
    expect(access.problem).not.toContain("sb_secret_");
  });
});
