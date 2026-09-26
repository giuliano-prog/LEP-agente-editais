import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatBRL,
  formatBytes,
  formatDate,
  toBrasiliaInputs,
  toMoneyInput,
} from "./format";

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

describe("campos de formulário", () => {
  it("converte prazo para data/hora de Brasília", () => {
    expect(toBrasiliaInputs("2026-11-30T23:59:00-03:00")).toEqual({
      date: "2026-11-30",
      time: "23:59",
    });
    expect(toBrasiliaInputs("2026-12-01T02:59:00Z")).toEqual({ date: "2026-11-30", time: "23:59" });
    expect(toBrasiliaInputs("2026-11-30")).toEqual({ date: "2026-11-30", time: "23:59" });
    expect(toBrasiliaInputs(null)).toEqual({ date: "", time: "" });
  });

  it("formata valores e tamanhos", () => {
    expect(toMoneyInput(1500000)).toBe("1.500.000,00");
    expect(toMoneyInput(null)).toBe("");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
  });
});
