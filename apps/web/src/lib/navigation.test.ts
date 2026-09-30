import { describe, expect, it } from "vitest";
import { firstName, initials, isActiveHref, NAVIGATION_ITEMS, navigationFor } from "./navigation";

const keys = (role: "admin" | "editor" | "viewer") => navigationFor(role).map((item) => item.key);

describe("navegação global", () => {
  it("mantém a ordem do menu e Diagnóstico separado ao final", () => {
    expect(NAVIGATION_ITEMS.map((item) => item.label)).toEqual([
      "Início",
      "Editais",
      "Produções",
      "Produções Atuais",
      "Equipe Audiovisual",
      "Membros",
      "Diagnóstico",
    ]);
    expect(NAVIGATION_ITEMS.at(-1)).toMatchObject({ key: "diagnostico", section: "admin" });
  });

  it("ADM vê Diagnóstico; Diretoria e Equipe não", () => {
    expect(keys("admin")).toContain("diagnostico");
    expect(keys("editor")).not.toContain("diagnostico");
    expect(keys("viewer")).not.toContain("diagnostico");
  });

  it("todos os perfis veem os módulos principais e Membros", () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      expect(keys(role)).toEqual(
        expect.arrayContaining([
          "inicio",
          "editais",
          "producoes",
          "producoes-atuais",
          "equipe-audiovisual",
          "membros",
        ]),
      );
    }
    expect(navigationFor(null)).toEqual([]);
  });

  it("item ativo pela rota", () => {
    expect(isActiveHref("/", "/")).toBe(true);
    expect(isActiveHref("/", "/editais")).toBe(false);
    expect(isActiveHref("/editais", "/editais/fontes")).toBe(true);
    expect(isActiveHref("/projetos", "/projetos-antigos")).toBe(false);
  });

  it("primeiro nome e iniciais sem inventar dados", () => {
    expect(firstName("Maria Clara Souza")).toBe("Maria");
    expect(firstName(" Pessoa  Teste ")).toBe("Pessoa");
    expect(firstName("  ")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(initials("Maria Clara Souza")).toBe("MS");
    expect(initials("Giuliano")).toBe("G");
    expect(initials(null)).toBe("?");
  });
});
