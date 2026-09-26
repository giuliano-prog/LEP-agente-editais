import { describe, expect, it } from "vitest";
import { daysUntil, formatBRL, formatDate } from "./format";

describe("format", () => {
  it("formata moeda em reais", () => {
    expect(formatBRL(1500000)).toMatch(/R\$\s?1\.500\.000,00/);
    expect(formatBRL(null)).toBe("—");
  });

  it("formata datas no fuso de Brasília sem deslocar datas simples", () => {
    expect(formatDate("2026-10-10")).toBe("10/10/2026");
    expect(formatDate("2026-10-11T01:00:00Z")).toBe("10/10/2026");
    expect(formatDate(null)).toBe("—");
  });

  it("calcula dias até o prazo", () => {
    const now = new Date("2026-09-26T12:00:00-03:00");
    expect(daysUntil("2026-09-30", now)).toBe(5);
    expect(daysUntil("2026-09-20", now)).toBeLessThan(0);
    expect(daysUntil(null, now)).toBeNull();
  });
});
