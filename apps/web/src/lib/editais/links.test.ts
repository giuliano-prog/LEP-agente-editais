import { describe, expect, it } from "vitest";
import { findSameSource, safeExternalUrl, sourceKey } from "./links";

describe("links externos", () => {
  it("só aceita http(s)", () => {
    expect(safeExternalUrl("https://www.exemplo.gov.br/edital")).toBe(
      "https://www.exemplo.gov.br/edital",
    );
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("ftp://exemplo.org/x")).toBeNull();
    expect(safeExternalUrl("não é url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it("fonte repetida: ignora www, barra final e fragmento", () => {
    expect(sourceKey("https://www.Exemplo.org/editais/#topo")).toBe("exemplo.org/editais");
    const sources = [{ id: "1", list_url: "https://exemplo.org/editais/" }];
    expect(findSameSource(sources, "http://www.exemplo.org/editais")?.id).toBe("1");
    expect(findSameSource(sources, "https://exemplo.org/chamadas")).toBeNull();
    expect(findSameSource(sources, "sem-url")).toBeNull();
  });
});
