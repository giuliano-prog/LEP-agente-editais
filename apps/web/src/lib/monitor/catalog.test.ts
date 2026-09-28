import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCE_ADAPTER, parseSourceAdapter } from "@lep/funding";
import { SOURCE_CATALOG } from "./catalog";

describe("catálogo de novas fontes (etapa 11)", () => {
  it("cobre as fontes pedidas", () => {
    expect(SOURCE_CATALOG.map((entry) => entry.key)).toEqual([
      "sp-sceic",
      "minc",
      "brde-fsa",
      "prosas",
      "sponsor",
    ]);
  });

  it("configuração válida, sem seletores e sem endereço inventado", () => {
    for (const entry of SOURCE_CATALOG) {
      expect(parseSourceAdapter(entry.adapter).warning).toBeNull();
      expect(Object.keys(entry.adapter).sort()).toEqual(Object.keys(DEFAULT_SOURCE_ADAPTER).sort());
      expect(JSON.stringify(entry)).not.toMatch(/https?:\/\//);
      expect(JSON.stringify(entry)).not.toMatch(/selector|xpath|querySelector/i);
    }
  });
});
