import { describe, expect, it } from "vitest";
import { selectCandidates } from "./monitor";
import { DEFAULT_SOURCE_ADAPTER, linesToList, parseSourceAdapter } from "./source-adapter";

describe("parseSourceAdapter", () => {
  it("vazio → padrão", () => {
    expect(parseSourceAdapter({})).toEqual({ adapter: DEFAULT_SOURCE_ADAPTER, warning: null });
    expect(DEFAULT_SOURCE_ADAPTER).toMatchObject({
      maxImports: 5,
      classifyPages: true,
      allowPdfLinks: true,
    });
  });

  it("inválido (campo desconhecido, limite fora da faixa) → padrão + aviso, sem quebrar", () => {
    const unknown = parseSourceAdapter({ cssSelector: ".lista a" });
    expect(unknown.adapter).toEqual(DEFAULT_SOURCE_ADAPTER);
    expect(unknown.warning).toContain("inválida");
    expect(parseSourceAdapter({ maxImports: 50 }).warning).toContain("maxImports");
  });

  it("linesToList: uma entrada por linha", () => {
    expect(linesToList(" /resultado \n\n/noticias/ ")).toEqual(["/resultado", "/noticias/"]);
  });
});

describe("selectCandidates com adaptador", () => {
  const links = [
    { text: "Edital de Produção Audiovisual 2026", url: "https://a.exemplo.org/editais/producao/" },
    { text: "Edital de Curtas (arquivo)", url: "https://a.exemplo.org/editais/curtas.pdf" },
    { text: "Edital antigo — acervo", url: "https://a.exemplo.org/acervo/editais/antigo/" },
    { text: "Edital de Séries — encerrado", url: "https://a.exemplo.org/editais/series/" },
  ];
  const base = {
    listUrl: "https://a.exemplo.org/editais/",
    audiovisualOnly: true,
    linkContains: null,
  };

  it("sem adaptador: comportamento anterior", () => {
    expect(selectCandidates(links, base, new Set())).toHaveLength(4);
  });

  it("exclusões por endereço e por título (sem acentos/maiúsculas) e PDFs desligados", () => {
    const result = selectCandidates(
      links,
      { ...base, linkExcludes: ["/acervo/"], titleExcludes: ["ENCERRADO"], allowPdfLinks: false },
      new Set(),
    );
    expect(result.map((item) => item.url)).toEqual(["https://a.exemplo.org/editais/producao/"]);
  });
});
