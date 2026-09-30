import { describe, expect, it } from "vitest";
import { findSameSource, homepageOf, safeExternalUrl, sourceKey } from "./links";

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

describe("página principal da fonte", () => {
  it("é a raiz do site da página de listagem", () => {
    expect(homepageOf("https://www.exemplo.gov.br/cultura/editais/?ano=2026")).toBe(
      "https://www.exemplo.gov.br/",
    );
    expect(homepageOf("javascript:alert(1)")).toBeNull();
  });
});
