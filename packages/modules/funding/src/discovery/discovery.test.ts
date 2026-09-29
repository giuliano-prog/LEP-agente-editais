import { describe, expect, it } from "vitest";
import { findOfficialLink, institutionName } from "./official-source";
import { allDiscoveryQueries, planDiscoveryQueries } from "./queries";
import { siteKindOf, triageSearchHit } from "./triage";

describe("consultas da descoberta web", () => {
  const context = { year: 2026, favorites: ["Spcine", "RioFilme"] };

  it("gera famílias sem repetição, termos audiovisuais primeiro", () => {
    const all = allDiscoveryQueries(context);
    expect(all[0]).toEqual({ query: "edital audiovisual 2026", family: "core", priority: 1 });
    expect(new Set(all.map((q) => q.query.toLowerCase())).size).toBe(all.length);
    expect(all.some((q) => q.query === "documentário prêmio 2026" && q.family === "format")).toBe(
      true,
    );
    expect(all.some((q) => q.query === "Spcine edital 2026" && q.family === "favorites")).toBe(
      true,
    );
  });

  it("respeita o limite e percorre todas as consultas em rodízio", () => {
    const total = allDiscoveryQueries(context).length;
    const seen = new Set<string>();
    for (let rotation = 0; rotation < total; rotation++) {
      const plan = planDiscoveryQueries(context, { limit: 6, rotation });
      expect(plan).toHaveLength(6);
      expect(plan[0]!.query).toBe("edital audiovisual 2026");
      plan.forEach((q) => seen.add(q.query));
    }
    expect(seen.size).toBe(total);
  });

  it("limite zero não gera consultas", () => {
    expect(planDiscoveryQueries(context, { limit: 0, rotation: 3 })).toEqual([]);
  });
});

describe("triagem de resultados de busca", () => {
  const hit = (title: string, url: string, snippet = "") => ({ title, url, snippet, position: 1 });

  it("mantém edital de audiovisual e identifica o tipo do site", () => {
    const result = triageSearchHit(
      hit(
        "Edital de fomento ao cinema 2026",
        "https://www.cultura.sp.gov.br/editais/cinema-2026#x",
      ),
    );
    expect(result).toMatchObject({
      keep: true,
      host: "cultura.sp.gov.br",
      siteKind: "official",
      url: "https://www.cultura.sp.gov.br/editais/cinema-2026",
    });
  });

  it("descarta redes sociais, arquivos e resultados sem termos de edital", () => {
    expect(triageSearchHit(hit("Edital audiovisual", "https://instagram.com/p/abc")).keep).toBe(
      false,
    );
    expect(triageSearchHit(hit("Edital audiovisual", "https://site.org/edital.docx")).keep).toBe(
      false,
    );
    expect(triageSearchHit(hit("Receita de bolo", "https://site.org/bolo")).reason).toBe(
      "sem termos de edital nem de audiovisual",
    );
    expect(triageSearchHit(hit("Crítica do filme X", "https://site.org/critica")).keep).toBe(false);
    expect(triageSearchHit(hit("Edital", "ftp://site.org/edital")).keep).toBe(false);
  });

  it("classifica agregador, notícia e fonte já cadastrada", () => {
    expect(siteKindOf("https://prosas.com.br/editais/123")).toBe("aggregator");
    expect(siteKindOf("https://portal.org/noticias/edital-cinema")).toBe("news");
    expect(
      siteKindOf("https://spcine.com.br/editais/x", { knownHosts: new Set(["spcine.com.br"]) }),
    ).toBe("known_source");
  });
});

describe("fonte oficial", () => {
  it("caso 10: notícia sobre edital → aponta para a oportunidade oficial", () => {
    const official = findOfficialLink({
      url: "https://portal-noticias.example/noticias/abertas-inscricoes-cinema",
      links: [
        { text: "Compartilhe", url: "https://facebook.com/share?u=x" },
        { text: "Outra notícia", url: "https://portal-noticias.example/noticias/outra" },
        { text: "Leia o regulamento", url: "https://cultura.exemplo.gov.br/editais/cinema-2026" },
        { text: "Parceiro", url: "https://empresa.example/" },
      ],
    });
    expect(official).toMatchObject({
      url: "https://cultura.exemplo.gov.br/editais/cinema-2026",
      host: "cultura.exemplo.gov.br",
    });
    expect(official!.reason).toContain("domínio governamental");
  });

  it("agregador → site do instituto (não governamental) pelo texto e endereço", () => {
    const official = findOfficialLink({
      url: "https://prosas.com.br/editais/999",
      links: [
        { text: "Site oficial do programa", url: "https://instituto-exemplo.org.br/chamada-2026" },
        { text: "Outro edital", url: "https://prosas.com.br/editais/1000" },
      ],
    });
    expect(official?.url).toBe("https://instituto-exemplo.org.br/chamada-2026");
  });

  it("sem link confiável → null (não inventa fonte oficial)", () => {
    expect(
      findOfficialLink({
        url: "https://blog.example/post",
        links: [{ text: "Home", url: "https://outro.example/" }],
      }),
    ).toBeNull();
  });

  it("nome da instituição pelo título da página ou domínio", () => {
    expect(institutionName("Edital de Curtas 2026 | Instituto Exemplo", "https://x.org")).toBe(
      "Instituto Exemplo",
    );
    expect(institutionName("Página", "https://www.instituto.org.br/a")).toBe("instituto.org.br");
  });
});
