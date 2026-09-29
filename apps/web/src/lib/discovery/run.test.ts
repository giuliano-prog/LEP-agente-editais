import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeSupabase, type FakeDb } from "@/test/fake-supabase";
import { SearchProviderError, type SearchProvider, type SearchRequest } from "./search-provider";

const ORG = "10000000-0000-4000-8000-00000000000b";
const NOW = new Date("2026-09-29T12:00:00-03:00");

/**
 * Dois "sites" FICTÍCIOS: o da instituição (127.0.0.1, fonte já cadastrada) e um
 * portal/agregador (localhost). Nenhum edital real.
 */
function startSite(pages: Record<string, string>, host: "127.0.0.1" | "localhost") {
  const server: Server = createServer((req, res) => {
    const body = pages[req.url ?? ""];
    if (!body) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  });
  return new Promise<{ base: string; server: Server }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ base: `http://${host}:${(server.address() as AddressInfo).port}`, server }),
    ),
  );
}

let official: Awaited<ReturnType<typeof startSite>>;
let portal: Awaited<ReturnType<typeof startSite>>;
let supabase: Awaited<ReturnType<typeof startFakeSupabase>>;

const db: FakeDb = {
  organizations: [{ id: ORG, name: "Org fictícia", slug: "org-ficticia" }],
  editais: [],
  edital_documents: [],
  edital_sources: [],
  edital_sightings: [],
  edital_matches: [],
  monitor_ignored_urls: [],
  discovery_runs: [],
  discovery_candidates: [],
  projetos: [],
};

type Result = { title: string; url: string; snippet: string };

/** Provedor de busca FALSO: devolve resultados fixos (ou um erro) por consulta. */
class FakeProvider implements SearchProvider {
  readonly name = "fake";
  calls: SearchRequest[] = [];
  constructor(
    private readonly answer: (query: string, page: number) => Result[] | SearchProviderError,
    private readonly hasMore = false,
  ) {}
  async search(request: SearchRequest) {
    this.calls.push(request);
    const answer = this.answer(request.query, request.page);
    if (answer instanceof SearchProviderError) throw answer;
    return {
      results: answer.map((item, index) => ({
        ...item,
        position: index + 1,
        domain: new URL(item.url).hostname,
        age: null,
      })),
      hasMore: this.hasMore,
    };
  }
}

const limits = {
  maxQueries: 2,
  resultsPerQuery: 20,
  pagesPerQuery: 1,
  maxRawResults: 100,
  maxRequestsPerRun: 10,
  maxRequestsPerMonth: 1000,
  maxCandidates: 10,
  minQueryIntervalMs: 0,
  timeBudgetMs: 60_000,
};

let results: Result[] = [];

beforeAll(async () => {
  process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK = "1"; // só vale com NODE_ENV=test
  official = await startSite(
    {
      "/editais/curtas-2026": `<html><head></head><body>
        <h1>Edital de Curtas-Metragens 2026</h1>
        <p>Objeto: produção de curtas-metragens de ficção e documentário.</p>
        <p>Inscrições de 01/10/2026 a 30/11/2026. Podem participar produtoras de todo o território nacional.</p>
        <p>Valor total de R$ 1.000.000,00.</p></body></html>`,
      "/editais/memoria-do-esporte": `<html><head><title>Programa Memória do Esporte | Instituição Fictícia</title></head><body>
        <h1>Programa Memória do Esporte 2026</h1>
        <p>O programa apoia a produção de documentários sobre atletas brasileiros.</p>
        <p>Inscrições abertas até 15/12/2026. Proponentes: produtoras de todo o país.</p></body></html>`,
      "/editais/cinema-2025": `<html><head><title>Edital de Cinema 2025 | Instituição Fictícia</title></head><body>
        <h1>Edital de Cinema 2025</h1>
        <p>Objeto: produção de longas-metragens. Inscrições até 30/03/2026. Podem participar produtoras.</p></body></html>`,
    },
    "127.0.0.1",
  );
  portal = await startSite(
    {
      "/oportunidades/memoria-esporte": `<html><head><title>Oportunidade | Portal Fictício</title></head><body>
        <h1>Programa Memória do Esporte — inscrições abertas</h1>
        <p>Programa de apoio a documentários sobre esporte. Inscrições até 15/12/2026.</p>
        <a href="https://facebook.com/compartilhar">Compartilhe</a>
        <a href="${official.base}/editais/memoria-do-esporte">Site oficial do programa</a></body></html>`,
      "/editais/teatro-2026": `<html><head><title>Edital de Artes Cênicas 2026</title></head><body>
        <h1>Edital de Artes Cênicas 2026</h1>
        <p>O objeto é a montagem de espetáculos teatrais inéditos. Inscrições até 30/11/2026. Podem participar grupos de teatro.</p>
        <p>Os projetos podem prever registro audiovisual das apresentações como atividade complementar.</p></body></html>`,
      "/editais/ocupacao": `<html><head><title>Edital de Ocupação Cultural 2026</title></head><body>
        <h1>Edital de Ocupação Cultural 2026</h1>
        <p>Inscrições até 20/11/2026. Podem participar coletivos culturais. Regulamento disponível na secretaria.</p>
        <p>A sala tem equipamento audiovisual para os grupos selecionados.</p></body></html>`,
    },
    "localhost",
  );
  supabase = await startFakeSupabase(db);
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabase.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake";
  process.env.SUPABASE_SECRET_KEY = "fake-secret";
  db.edital_sources!.push({
    id: "fonte-oficial",
    org_id: ORG,
    name: "Instituição Fictícia — Editais",
    agency: "Instituição Fictícia",
    list_url: `${official.base}/editais/`,
    audiovisual_only: true,
    link_contains: null,
    active: true,
    is_favorite: true,
  });
  results = [
    {
      title: "[BRAVE-TITULO] Edital de Curtas-Metragens 2026",
      url: `${official.base}/editais/curtas-2026`,
      snippet: "[BRAVE-TRECHO] Produção de curtas. Inscrições até 30/11/2026.",
    },
    {
      title: "[BRAVE-TITULO] Programa Memória do Esporte — inscrições abertas",
      url: `${portal.base}/oportunidades/memoria-esporte`,
      snippet: "[BRAVE-TRECHO] Programa de apoio a documentários sobre esporte.",
    },
    {
      title: "[BRAVE-TITULO] Edital de Artes Cênicas 2026",
      url: `${portal.base}/editais/teatro-2026`,
      snippet: "[BRAVE-TRECHO] Inscrições abertas, com linha audiovisual.",
    },
    {
      title: "[BRAVE-TITULO] Edital de Ocupação Cultural 2026",
      url: `${portal.base}/editais/ocupacao`,
      snippet: "[BRAVE-TRECHO] Chamada para coletivos, com sala e equipamento audiovisual.",
    },
    {
      title: "[BRAVE-TITULO] Edital de Cinema 2025",
      url: `${official.base}/editais/cinema-2025`,
      snippet: "[BRAVE-TRECHO] Edital de cinema.",
    },
    { title: "Edital de cinema no Instagram", url: "https://instagram.com/p/edital", snippet: "" },
  ];
});

afterAll(async () => {
  delete process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK;
  official.server.close();
  portal.server.close();
  await supabase.close();
});

describe("runWebDiscovery (descoberta web)", () => {
  it("sem provedor configurado: registra a execução e não busca nada", async () => {
    const { runWebDiscovery } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "manual",
      orgId: ORG,
      now: NOW,
      provider: null,
    });
    expect(result).toMatchObject({ status: "not_configured", queriesRun: 0 });
    expect(db.discovery_runs!.at(-1)).toMatchObject({ status: "not_configured", org_id: ORG });
    expect(db.editais).toHaveLength(0);
    db.discovery_runs!.length = 0;
  });

  it("importa só oportunidades audiovisuais pelo pipeline existente, com rastreabilidade", async () => {
    const { runWebDiscovery } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const provider = new FakeProvider(() => results);
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "manual",
      orgId: ORG,
      now: NOW,
      provider,
      limits,
    });

    expect(provider.calls).toHaveLength(2);
    expect(result).toMatchObject({
      status: "ok",
      provider: "fake",
      queriesRun: 2,
      uniqueUrls: 5, // a rede social cai na triagem
      triagedOut: 2, // a mesma rede social nas duas consultas
      apiRequests: 2,
      limitReached: null,
      alreadyKnown: 0,
      analyzed: 5,
      imported: 2,
      audiovisualYes: 3, // curtas, esporte e o edital de 2025 (encerrado)
      audiovisualNo: 1,
      audiovisualUncertain: 1,
      officialFound: 1,
      failed: 0,
    });

    // Só os dois audiovisuais abertos viram edital, com origem "web_discovery".
    expect(db.editais).toHaveLength(2);
    const curtas = db.editais!.find((e) => String(e.official_url).endsWith("/curtas-2026"))!;
    expect(curtas).toMatchObject({
      origin: "web_discovery",
      source_id: "fonte-oficial", // domínio de uma fonte já cadastrada
      agency: "Instituição Fictícia",
      review_status: "pending",
      deadline: "2026-11-30T23:59:00-03:00",
      eligible_territories: ["BR"],
    });
    expect(curtas.extraction_notes).toEqual(
      expect.arrayContaining([expect.stringContaining("Encontrado pela descoberta web")]),
    );

    // Tema esporte + objeto documentário: entra, e a referência é a página OFICIAL.
    const esporte = db.editais!.find((e) => String(e.official_url).includes("memoria-do-esporte"))!;
    expect(esporte).toMatchObject({ origin: "web_discovery", source_id: "fonte-oficial" });
    const sightings = db.edital_sightings!.filter((item) => item.edital_id === esporte.id);
    expect(sightings.map((item) => item.url)).toEqual([
      `${official.base}/editais/memoria-do-esporte`,
      `${portal.base}/oportunidades/memoria-esporte`,
    ]);

    // Teatro, incerto e encerrado NÃO viram edital: ficam só no registro técnico.
    const byUrl = (suffix: string) =>
      db.discovery_candidates!.find((item) => String(item.url).endsWith(suffix))!;
    expect(byUrl("/teatro-2026")).toMatchObject({
      status: "suppressed",
      audiovisual: "no",
      edital_id: null,
    });
    expect(String(byUrl("/teatro-2026").audiovisual_evidence)).toContain("espetáculos teatrais");
    expect(byUrl("/ocupacao")).toMatchObject({ status: "uncertain", audiovisual: "uncertain" });
    expect(byUrl("/cinema-2025")).toMatchObject({ status: "suppressed", audiovisual: "yes" });
    expect(String(byUrl("/cinema-2025").status_reason)).toContain("encerradas");
    expect(byUrl("/memoria-esporte")).toMatchObject({
      status: "imported",
      site_kind: "unknown",
      official_url: `${official.base}/editais/memoria-do-esporte`,
      audiovisual: "yes",
      edital_id: esporte.id,
    });
    expect(byUrl("/curtas-2026")).toMatchObject({ status: "imported", site_kind: "known_source" });

    // Persistência: do provedor de busca só a URL. Título/trecho da Brave ficam só em memória
    // (a triagem acima usou os dois: sem eles, esses resultados nem seriam analisados).
    const persisted = JSON.stringify({
      editais: db.editais,
      sightings: db.edital_sightings,
      candidates: db.discovery_candidates,
      runs: db.discovery_runs,
      documents: db.edital_documents,
    });
    expect(persisted).not.toContain("[BRAVE-TITULO]");
    expect(persisted).not.toContain("[BRAVE-TRECHO]");
    expect(db.discovery_candidates!.every((item) => item.snippet === null)).toBe(true);
    // Título gravado = título da página baixada (ou nulo quando a página não tem <title>).
    expect(byUrl("/teatro-2026").title).toBe("Edital de Artes Cênicas 2026");
    expect(byUrl("/memoria-esporte").title).toBe(
      "Programa Memória do Esporte | Instituição Fictícia",
    );
    expect(byUrl("/curtas-2026").title).toBeNull();
    // Página sem <title>: o edital usa o nome derivado do endereço baixado, não o da Brave.
    expect(curtas.title).toBe("curtas 2026");
    expect(
      db.edital_sightings!.find((item) =>
        String(item.url).endsWith("/oportunidades/memoria-esporte"),
      )!.title,
    ).toBe("Oportunidade | Portal Fictício");

    // Métricas da execução gravadas.
    expect(db.discovery_runs!.at(-1)).toMatchObject({
      org_id: ORG,
      trigger: "manual",
      status: "ok",
      imported: 2,
      audiovisual_no: 1,
      queries_run: 2,
      api_requests: 2,
      limit_reached: null,
    });
  });

  it("segunda execução: nada é reprocessado nem duplicado", async () => {
    const { runWebDiscovery } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "cron",
      orgId: ORG,
      now: NOW,
      provider: new FakeProvider(() => results),
      limits,
    });
    expect(result).toMatchObject({ analyzed: 0, imported: 0, alreadyKnown: 5 });
    expect(db.editais).toHaveLength(2);
    expect(
      db.discovery_candidates!.find((item) => String(item.url).endsWith("/teatro-2026"))!
        .times_seen,
    ).toBe(2);
  });

  it("incerto confirmado por um admin entra pelo mesmo pipeline", async () => {
    const { importUncertainCandidate } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const candidate = db.discovery_candidates!.find((item) =>
      String(item.url).endsWith("/ocupacao"),
    )!;
    const outcome = await importUncertainCandidate(
      createAdminClient(),
      ORG,
      String(candidate.id),
      NOW,
    );
    expect(outcome.ok).toBe(true);
    expect(db.editais).toHaveLength(3);
    expect(candidate).toMatchObject({ status: "imported" });
    expect(candidate.audiovisual_reasons).toEqual(
      expect.arrayContaining(["confirmado como audiovisual por um administrador"]),
    );
    const again = await importUncertainCandidate(
      createAdminClient(),
      ORG,
      String(candidate.id),
      NOW,
    );
    expect(again.ok).toBe(false);
  });

  it("limite do provedor: para as consultas e registra o bloqueio", async () => {
    const { runWebDiscovery } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const provider = new FakeProvider(
      () => new SearchProviderError("quota", "Limite do provedor de busca atingido."),
    );
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "manual",
      orgId: ORG,
      now: NOW,
      provider,
      limits,
    });
    expect(provider.calls).toHaveLength(1);
    expect(result).toMatchObject({ status: "error", providerLimited: true, queriesRun: 0 });
    expect(db.discovery_runs!.at(-1)).toMatchObject({ status: "error", provider_limited: true });
  });
});

/** Resultados que a triagem descarta sem download (sem termo de edital): só medem a busca. */
const noise = (query: string, page: number) =>
  Array.from({ length: 20 }, (_, index) => ({
    title: `Crítica do filme ${index}`,
    url: `https://critica.example/${Buffer.from(query).toString("hex")}/${page}/${index}`,
    snippet: "",
  }));

describe("proteção de custo da descoberta web", () => {
  const run = async (provider: SearchProvider, override: Partial<typeof limits>) => {
    const { runWebDiscovery } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "manual",
      orgId: ORG,
      now: NOW,
      provider,
      limits: { ...limits, ...override },
    });
    return result!;
  };

  it("paginação: 2ª página só quando o provedor indica mais resultados", async () => {
    const withMore = new FakeProvider(noise, true);
    const result = await run(withMore, { pagesPerQuery: 2 });
    expect(withMore.calls.map((call) => call.page)).toEqual([0, 1, 0, 1]);
    expect(result).toMatchObject({ apiRequests: 4, resultsReceived: 80, limitReached: null });
    expect(result.triagedOut).toBe(80);

    const noMore = new FakeProvider(noise, false);
    await run(noMore, { pagesPerQuery: 2 });
    expect(noMore.calls.map((call) => call.page)).toEqual([0, 0]);
  });

  it("teto de resultados brutos: para de buscar e nunca passa do teto", async () => {
    const provider = new FakeProvider(noise, true);
    const result = await run(provider, { pagesPerQuery: 2, maxRawResults: 30 });
    expect(provider.calls).toHaveLength(2);
    expect(result).toMatchObject({
      resultsReceived: 30,
      limitReached: "raw_results",
      status: "ok",
    });
  });

  it("teto de chamadas por execução: a 4ª chamada não acontece", async () => {
    const provider = new FakeProvider(noise, true);
    const result = await run(provider, { pagesPerQuery: 2, maxRequestsPerRun: 3 });
    expect(provider.calls).toHaveLength(3);
    expect(result).toMatchObject({ apiRequests: 3, limitReached: "per_run" });
    expect(db.discovery_runs!.at(-1)).toMatchObject({ api_requests: 3, limit_reached: "per_run" });
  });

  it("nova tentativa após falha transitória também é contada e reservada", async () => {
    let failures = 0;
    const provider = new FakeProvider((query, page) => {
      if (failures++ === 0) return new SearchProviderError("network", "falha simulada");
      return noise(query, page);
    });
    const result = await run(provider, { maxQueries: 1 });
    expect(provider.calls).toHaveLength(2);
    expect(result.apiRequests).toBe(2);
  });

  it("teto mensal: reserva recusada no banco impede a chamada", async () => {
    const usage = db.search_api_usage!.find((row) => row.org_id === ORG)!;
    const before = Number(usage.requests);
    const provider = new FakeProvider(noise);
    const result = await run(provider, { maxRequestsPerMonth: before + 1 });
    expect(provider.calls).toHaveLength(1);
    expect(result).toMatchObject({ apiRequests: 1, limitReached: "per_month", status: "partial" });
    expect(Number(usage.requests)).toBe(before + 1);
  });

  it("falha ao reservar no contador: não busca nada (falha fechada)", async () => {
    db.__fail_reserve = [{}];
    const provider = new FakeProvider(noise);
    const result = await run(provider, {});
    delete db.__fail_reserve;
    expect(provider.calls).toHaveLength(0);
    expect(result).toMatchObject({
      apiRequests: 0,
      limitReached: "reservation_failed",
      status: "error",
    });
    expect(db.discovery_runs!.at(-1)).toMatchObject({ limit_reached: "reservation_failed" });
  });
});
