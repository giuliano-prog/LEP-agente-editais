import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeRedirectPath("/conta/senha")).toBe("/conta/senha");
    expect(safeRedirectPath("/?a=1")).toBe("/?a=1");
  });

  it("rejeita URLs externas e valores vazios", () => {
    expect(safeRedirectPath("https://malicioso.com")).toBe("/");
    expect(safeRedirectPath("//malicioso.com")).toBe("/");
    expect(safeRedirectPath("/\\malicioso.com")).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("", "/login")).toBe("/login");
  });
});
