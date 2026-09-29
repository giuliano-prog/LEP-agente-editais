import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BraveSearchProvider,
  discoveryLimitsFromEnv,
  searchProviderFromEnv,
  SearchProviderError,
} from "./search-provider";

let server: Server;
let base: string;
let lastRequest: { url: string; token: string | undefined } | null = null;

beforeAll(async () => {
  process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK = "1"; // só vale com NODE_ENV=test
  server = createServer((req, res) => {
    lastRequest = { url: req.url ?? "", token: req.headers["x-subscription-token"] as string };
    if (req.headers["x-subscription-token"] === "chave-recusada") {
      res.writeHead(401);
      return res.end();
    }
    if (req.headers["x-subscription-token"] === "parametro-invalido") {
      res.writeHead(422);
      return res.end();
    }
    if (req.headers["x-subscription-token"] === "sem-cota-123") {
      res.writeHead(429);
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        query: { more_results_available: true },
        web: {
          results: [
            {
              title: "Edital <strong>audiovisual</strong> 2026",
              url: "https://www.exemplo.gov.br/edital",
              description: "Inscrições   abertas",
              age: "2 dias",
            },
            { title: "Sem endereço válido", url: "nao-e-url" },
          ],
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/busca`;
});

afterAll(() => {
  delete process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK;
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("BraveSearchProvider (resposta simulada, sem rede externa)", () => {
  it("normaliza resultados e envia a chave só no cabeçalho", async () => {
    const provider = new BraveSearchProvider("chave-de-teste", base);
    const page = await provider.search({ query: "edital cinema 2026", count: 50, page: 1 });
    expect(page).toEqual({
      hasMore: true,
      results: [
        {
          title: "Edital audiovisual 2026",
          url: "https://www.exemplo.gov.br/edital",
          snippet: "Inscrições abertas",
          position: 21,
          domain: "exemplo.gov.br",
          age: "2 dias",
        },
      ],
    });
    expect(lastRequest!.token).toBe("chave-de-teste");
    expect(lastRequest!.url).toContain("count=20");
    expect(lastRequest!.url).not.toContain("chave-de-teste");
  });

  it("traduz recusa da chave e falta de cota", async () => {
    await expect(
      new BraveSearchProvider("chave-recusada", base).search({ query: "x", count: 5, page: 0 }),
    ).rejects.toMatchObject({ kind: "auth" });
    const quota = new BraveSearchProvider("sem-cota-123", base).search({
      query: "x",
      count: 5,
      page: 0,
    });
    await expect(quota).rejects.toBeInstanceOf(SearchProviderError);
    await expect(quota).rejects.toMatchObject({ kind: "quota", retryable: false });
    await expect(
      new BraveSearchProvider("parametro-invalido", base).search({ query: "x", count: 5, page: 0 }),
    ).rejects.toMatchObject({ kind: "config", message: expect.stringContaining("HTTP 422") });
  });
});

describe("configuração por variáveis de ambiente", () => {
  it("sem provedor: explica o que configurar, sem inventar chave", () => {
    const result = searchProviderFromEnv({} as NodeJS.ProcessEnv);
    expect(result.provider).toBeNull();
    expect(result.problem).toContain("WEB_SEARCH_PROVIDER");
  });

  it("provedor desconhecido ou chave ausente não são aceitos", () => {
    expect(
      searchProviderFromEnv({ WEB_SEARCH_PROVIDER: "google" } as unknown as NodeJS.ProcessEnv)
        .problem,
    ).toContain("desconhecido");
    expect(
      searchProviderFromEnv({ WEB_SEARCH_PROVIDER: "brave" } as unknown as NodeJS.ProcessEnv)
        .problem,
    ).toContain("WEB_SEARCH_API_KEY");
    expect(
      searchProviderFromEnv({
        WEB_SEARCH_PROVIDER: "Brave",
        WEB_SEARCH_API_KEY: "chave-de-teste",
      } as unknown as NodeJS.ProcessEnv).provider?.name,
    ).toBe("brave");
  });

  it("limites têm padrão e faixa segura", () => {
    expect(discoveryLimitsFromEnv({} as NodeJS.ProcessEnv)).toMatchObject({
      maxQueries: 6,
      resultsPerQuery: 10,
      maxCandidates: 8,
    });
    expect(
      discoveryLimitsFromEnv({
        WEB_DISCOVERY_MAX_QUERIES: "1000",
        WEB_DISCOVERY_RESULTS_PER_QUERY: "5",
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ maxQueries: 6, resultsPerQuery: 5 });
  });
});
