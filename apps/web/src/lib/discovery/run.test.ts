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
  constructor(private readonly answer: (query: string) => Result[] | SearchProviderError) {}
  async search(request: SearchRequest) {
    this.calls.push(request);
    const answer = this.answer(request.query);
    if (answer instanceof SearchProviderError) throw answer;
    return {
      results: answer.map((item, index) => ({
        ...item,
        position: index + 1,
        domain: new URL(item.url).hostname,
        age: null,
      })),
      hasMore: false,
    };
  }
}

const limits = {
  maxQueries: 2,
  resultsPerQuery: 10,
  maxCandidates: 10,
  minQueryIntervalMs: 0,
  timeBudgetMs: 60_000,
};

let results: Result[] = [];

beforeAll(async () => {
  process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK = "1"; // só vale com NODE_ENV=test
  official = await startSite(
    {
      "/editais/curtas-2026": `<html><head><title>Edital de Curtas-Metragens 2026 | Instituição Fictícia</title></head><body>
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
      title: "Edital de Curtas-Metragens 2026",
      url: `${official.base}/editais/curtas-2026`,
      snippet: "Produção de curtas. Inscrições até 30/11/2026.",
    },
    {
      title: "Programa Memória do Esporte — inscrições abertas",
      url: `${portal.base}/oportunidades/memoria-esporte`,
      snippet: "Programa de apoio a documentários sobre esporte.",
    },
    {
      title: "Edital de Artes Cênicas 2026",
      url: `${portal.base}/editais/teatro-2026`,
      snippet: "Edital para espetáculos teatrais.",
    },
    {
      title: "Edital de Ocupação Cultural 2026",
      url: `${portal.base}/editais/ocupacao`,
      snippet: "Chamada para coletivos culturais.",
    },
    {
      title: "Edital de Cinema 2025",
      url: `${official.base}/editais/cinema-2025`,
      snippet: "Edital de cinema.",
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

    // Métricas da execução gravadas.
    expect(db.discovery_runs!.at(-1)).toMatchObject({
      org_id: ORG,
      trigger: "manual",
      status: "ok",
      imported: 2,
      audiovisual_no: 1,
      queries_run: 2,
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
