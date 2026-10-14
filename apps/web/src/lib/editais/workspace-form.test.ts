import { describe, expect, it } from "vitest";
import {
  acervoPath,
  isValidAcervoPath,
  parseItemForm,
  parseOrgDocumentForm,
  parseWorkspaceForm,
} from "./workspace-form";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

const ORG = "10000000-0000-4000-8000-00000000000a";

describe("parseWorkspaceForm", () => {
  it("lê valores em formato brasileiro e só os campos enviados", () => {
    const result = parseWorkspaceForm(form({ requested_amount: "1.500.000,50", total_budget: "" }));
    expect(result).toEqual({
      ok: true,
      value: { requested_amount: 1500000.5, total_budget: null },
    });
  });
  it("recusa status e valores inválidos", () => {
    expect(parseWorkspaceForm(form({ status: "talvez" })).ok).toBe(false);
    expect(parseWorkspaceForm(form({ total_budget: "abc" })).ok).toBe(false);
  });
  it("produção inválida vira desvínculo (nunca texto livre no banco)", () => {
    expect(parseWorkspaceForm(form({ projeto_id: "x' or 1=1" }))).toEqual({
      ok: true,
      value: { projeto_id: null },
    });
  });
});

describe("parseItemForm", () => {
  it("item novo exige título; limites são inteiros positivos", () => {
    expect(parseItemForm(form({}), true).ok).toBe(false);
    expect(parseItemForm(form({ title: "Sinopse", char_limit: "1.500" }), true)).toEqual({
      ok: true,
      value: { title: "Sinopse", char_limit: 1500 },
    });
    expect(parseItemForm(form({ char_limit: "-3" })).ok).toBe(false);
  });
  it("valida vocabulário, datas e texto", () => {
    expect(parseItemForm(form({ status: "feito" })).ok).toBe(false);
    expect(parseItemForm(form({ category: "x" })).ok).toBe(false);
    const ok = parseItemForm(form({ status: "done", due_date: "2026-13-40", content: "  " }));
    expect(ok).toEqual({ ok: true, value: { status: "done", due_date: null, content: null } });
    expect(parseItemForm(form({ content: "a".repeat(50_001) })).ok).toBe(false);
  });
});

describe("parseOrgDocumentForm", () => {
  it("documento de produção exige a produção; link só http(s)", () => {
    expect(parseOrgDocumentForm(form({ title: "Cessão", scope: "production" })).ok).toBe(false);
    expect(parseOrgDocumentForm(form({ title: "CND", external_url: "javascript:x" })).ok).toBe(
      false,
    );
    expect(parseOrgDocumentForm(form({ title: "CND", valid_until: "2026-12-31" }))).toMatchObject({
      ok: true,
      value: { scope: "company", category: "other", projeto_id: null, valid_until: "2026-12-31" },
    });
  });
});

describe("caminho do acervo", () => {
  it("só aceita <org>/acervo/<uuid>.pdf da própria organização", () => {
    const path = acervoPath(ORG, "20000000-0000-4000-8000-000000000001");
    expect(isValidAcervoPath(ORG, path)).toBe(true);
    expect(isValidAcervoPath(ORG, `${ORG}/acervo/../x.pdf`)).toBe(false);
    expect(isValidAcervoPath(ORG, path.replace(ORG, "10000000-0000-4000-8000-00000000000b"))).toBe(
      false,
    );
  });
});
