import { describe, expect, it } from "vitest";
import { editalMetrics, isActiveEdital, isDeadlineSoon, needsReview } from "./metrics";

const now = new Date("2026-10-01T12:00:00-03:00");
const base = { status: "open", reviewStatus: "validated", origin: "manual", deadline: null };

describe("indicadores de editais", () => {
  it("ativo = aberto/em breve e não descartado", () => {
    expect(isActiveEdital(base)).toBe(true);
    expect(isActiveEdital({ ...base, status: "upcoming" })).toBe(true);
    expect(isActiveEdital({ ...base, status: "closed" })).toBe(false);
    expect(isActiveEdital({ ...base, reviewStatus: "discarded" })).toBe(false);
    expect(isActiveEdital({ ...base, status: null })).toBe(false);
  });

  it("para revisar = automático, nem validado nem descartado", () => {
    expect(needsReview({ ...base, origin: "monitor", reviewStatus: "pending" })).toBe(true);
    expect(needsReview({ ...base, origin: "web_discovery", reviewStatus: "pending" })).toBe(true);
    expect(needsReview({ ...base, origin: "manual", reviewStatus: "pending" })).toBe(false);
    expect(needsReview({ ...base, origin: "monitor", reviewStatus: "validated" })).toBe(false);
  });

  it("próximo do prazo = ativo com prazo em até 15 dias (hoje conta; vencido não)", () => {
    expect(isDeadlineSoon({ ...base, deadline: "2026-10-01" }, now)).toBe(true);
    expect(isDeadlineSoon({ ...base, deadline: "2026-10-15" }, now)).toBe(true);
    expect(isDeadlineSoon({ ...base, deadline: "2026-10-20" }, now)).toBe(false);
    expect(isDeadlineSoon({ ...base, deadline: "2026-09-30" }, now)).toBe(false);
    expect(isDeadlineSoon({ ...base, deadline: "2026-10-05", status: "closed" }, now)).toBe(false);
    expect(isDeadlineSoon({ ...base, deadline: null }, now)).toBe(false);
  });

  it("totais", () => {
    expect(
      editalMetrics(
        [
          { ...base, deadline: "2026-10-03" },
          { ...base, origin: "monitor", reviewStatus: "pending", deadline: "2026-12-01" },
          { ...base, status: "closed" },
        ],
        now,
      ),
    ).toEqual({ active: 2, toReview: 1, deadlineSoon: 1 });
  });
});
