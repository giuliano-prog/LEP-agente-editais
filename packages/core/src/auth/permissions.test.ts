import { describe, expect, it } from "vitest";
import { can, hasRole, isMembershipStatus, isRole, ROLE_LABELS, ROLES } from "../index";

describe("hasRole", () => {
  it("respeita a hierarquia viewer < editor < admin", () => {
    expect(hasRole("admin", "viewer")).toBe(true);
    expect(hasRole("admin", "editor")).toBe(true);
    expect(hasRole("editor", "editor")).toBe(true);
    expect(hasRole("editor", "admin")).toBe(false);
    expect(hasRole("viewer", "editor")).toBe(false);
  });

  it("nega acesso quando não há papel", () => {
    expect(hasRole(null, "viewer")).toBe(false);
    expect(hasRole(undefined, "viewer")).toBe(false);
  });
});

describe("can", () => {
  it("visualização só lê", () => {
    expect(can("viewer", "content.read")).toBe(true);
    expect(can("viewer", "content.edit")).toBe(false);
    expect(can("viewer", "members.manage")).toBe(false);
  });

  it("editor/revisor edita e revisa, mas não administra", () => {
    expect(can("editor", "content.edit")).toBe(true);
    expect(can("editor", "content.review")).toBe(true);
    expect(can("editor", "members.manage")).toBe(false);
  });

  it("administrador pode tudo", () => {
    expect(can("admin", "members.manage")).toBe(true);
    expect(can("admin", "ai_usage.read")).toBe(true);
  });
});

describe("permissões da navegação", () => {
  it("Diagnóstico só para ADM; Membros visível a todos; gerenciar só ADM", () => {
    expect(can("admin", "diagnostics.view")).toBe(true);
    expect(can("editor", "diagnostics.view")).toBe(false);
    expect(can("viewer", "diagnostics.view")).toBe(false);
    expect(can("viewer", "members.read")).toBe(true);
    expect(can("editor", "members.manage")).toBe(false);
    expect(can("editor", "editais.search")).toBe(false);
    expect(can("admin", "editais.search")).toBe(true);
  });
});

describe("isRole", () => {
  it("valida strings de papel", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(1)).toBe(false);
  });
});

describe("perfis e status", () => {
  it("rótulos da LEP: Administrador = admin, Diretoria = editor, Equipe = viewer", () => {
    expect(ROLE_LABELS).toEqual({ admin: "Administrador", editor: "Diretoria", viewer: "Equipe" });
  });

  it("status do vínculo iguais ao CHECK da migração", () => {
    expect(isMembershipStatus("invited")).toBe(true);
    expect(isMembershipStatus("active")).toBe(true);
    expect(isMembershipStatus("suspended")).toBe(true);
    expect(isMembershipStatus("removed")).toBe(false);
  });
});
