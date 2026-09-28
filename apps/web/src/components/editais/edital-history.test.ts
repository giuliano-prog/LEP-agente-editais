import { describe, expect, it } from "vitest";
import { changedFields, type AuditEntry } from "./edital-history";

const entry = (
  old_data: Record<string, unknown>,
  new_data: Record<string, unknown>,
): AuditEntry => ({
  id: 1,
  action: "update",
  actor_id: null,
  old_data,
  new_data,
  created_at: "2026-09-28T12:00:00Z",
});

describe("changedFields (histórico do edital)", () => {
  it("lista só campos alterados, com rótulos em pt-BR, ignorando carimbos de data", () => {
    expect(
      changedFields(
        entry(
          {
            title: "A",
            eligibility_status: "not_confirmed",
            updated_at: "1",
            eligible_territories: [],
          },
          {
            title: "A",
            eligibility_status: "territorial_restriction",
            updated_at: "2",
            eligible_territories: ["RJ"],
          },
        ),
      ),
    ).toEqual([
      { field: "Elegibilidade", before: "Não confirmada", after: "Restrição territorial" },
      { field: "Territórios", before: "—", after: "RJ" },
    ]);
  });

  it("encurta textos longos e ignora criação/exclusão", () => {
    const [change] = changedFields(entry({ summary: "a" }, { summary: "x".repeat(200) }));
    expect(change!.after.length).toBeLessThanOrEqual(78);
    expect(changedFields({ ...entry({}, { title: "B" }), action: "insert" })).toEqual([]);
  });
});
