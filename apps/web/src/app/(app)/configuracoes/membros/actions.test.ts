import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRole, type Role } from "@lep/core";

/** Papel do usuário "logado" neste teste; requireMembership segue a regra real (hasRole). */
let role: Role = "viewer";
const createUser = vi.fn();
const createAdminClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
  auth: { admin: { createUser } },
}));

vi.mock("@/lib/auth/session", () => ({
  requireMembership: async (minimum: Role = "viewer") => {
    if (!hasRole(role, minimum)) throw new Error("NEXT_REDIRECT:/sem-acesso?motivo=permissao");
    return { userId: "u1", membership: { orgId: "org", orgName: "LEP", orgSlug: "lep", role } };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
  isAdminClientConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

const newMember = form({
  full_name: "Pessoa Nova",
  email: "pessoa@exemplo.com",
  role: "editor",
  password: "SenhaInicial123",
});

afterEach(() => vi.clearAllMocks());

describe("Membros — criação direta e edição só para ADM", () => {
  it.each<Role>(["viewer", "editor"])(
    "perfil %s não cria acesso nem usa a chave de serviço",
    async (current) => {
      role = current;
      const { createMemberAction } = await import("./actions");
      await expect(createMemberAction({}, newMember)).rejects.toThrow("NEXT_REDIRECT");
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it.each<Role>(["viewer", "editor"])(
    "perfil %s não edita nome/foto de outro membro",
    async (current) => {
      role = current;
      const { updateMemberProfileAction } = await import("./actions");
      const edit = form({
        user_id: "00000000-0000-4000-8000-000000000001",
        full_name: "Outro Nome",
      });
      await expect(updateMemberProfileAction({}, edit)).rejects.toThrow("NEXT_REDIRECT");
      expect(createAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each<Role>(["viewer", "editor"])(
    "perfil %s não exclui usuário nem altera perfil de acesso",
    async (current) => {
      role = current;
      const { deleteMemberAction, updateMemberProfileAction } = await import("./actions");
      const target = { user_id: "00000000-0000-4000-8000-000000000001" };
      await expect(
        deleteMemberAction({}, form({ ...target, confirmation: "EXCLUIR" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      await expect(
        updateMemberProfileAction({}, form({ ...target, full_name: "Nome", role: "admin" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(createAdminClient).not.toHaveBeenCalled();
    },
  );

  it("ADM passa pela checagem; senha fraca é recusada antes de chamar o Supabase Auth", async () => {
    role = "admin";
    const { createMemberAction } = await import("./actions");
    const weak = form({
      full_name: "Pessoa",
      email: "p@exemplo.com",
      role: "viewer",
      password: "123",
    });
    const result = await createMemberAction({}, weak);
    expect(result.error).toContain("10 caracteres");
    expect(createUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('123"');
  });

  it("ADM: foto inválida é recusada antes de criar a conta", async () => {
    role = "admin";
    const { createMemberAction } = await import("./actions");
    const data = form({
      full_name: "Pessoa Nova",
      email: "pessoa@exemplo.com",
      role: "editor",
      password: "SenhaInicial123",
    });
    data.set("avatar", new File(["<svg></svg>"], "foto.svg", { type: "image/svg+xml" }));
    expect(await createMemberAction({}, data)).toEqual({ error: "Use uma foto JPG, PNG ou WebP." });
    expect(createUser).not.toHaveBeenCalled();
  });
});
