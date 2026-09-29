import "server-only";

import { FetchError, safeFetch, UnsafeUrlError } from "@lep/ingestion";

/**
 * Provedor de busca da descoberta web (ADR-0024).
 *
 * A descoberta depende SÓ desta interface. Nada de scraping do Google/Bing: cada
 * provedor é um adaptador de API oficial, isolado aqui, configurado por variável de
 * ambiente no servidor. Sem provedor configurado, a descoberta não roda (e diz por quê).
 *
 *   WEB_SEARCH_PROVIDER = brave   (único adaptador por enquanto)
 *   WEB_SEARCH_API_KEY  = <chave do provedor>   (secreta, só no servidor)
 */
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  /** Posição no ranking (1 = primeiro), contando as páginas anteriores. */
  position: number;
  domain: string;
  /** Data informada pelo provedor, quando houver (texto livre). */
  age: string | null;
};

export type SearchPage = { results: SearchResult[]; hasMore: boolean };

export type SearchRequest = { query: string; count: number; page: number };

export type SearchErrorKind = "config" | "auth" | "quota" | "network" | "bad_response";

export class SearchProviderError extends Error {
  readonly kind: SearchErrorKind;
  constructor(kind: SearchErrorKind, message: string) {
    super(message);
    this.name = "SearchProviderError";
    this.kind = kind;
  }
  /** Vale tentar de novo (uma vez)? Cota e autenticação não. */
  get retryable() {
    return this.kind === "network" || this.kind === "bad_response";
  }
}

export interface SearchProvider {
  readonly name: string;
  search(request: SearchRequest): Promise<SearchPage>;
}

const clean = (text: unknown) =>
  typeof text === "string"
    ? text
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

/** Brave Search API (web). Documentação: https://api.search.brave.com/app/documentation */
export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  constructor(
    private readonly apiKey: string,
    private readonly endpoint = "https://api.search.brave.com/res/v1/web/search",
  ) {}

  async search({ query, count, page }: SearchRequest): Promise<SearchPage> {
    const perPage = Math.min(Math.max(count, 1), 20);
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(perPage));
    url.searchParams.set("offset", String(Math.min(Math.max(page, 0), 9)));
    url.searchParams.set("country", "BR");
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("text_decorations", "false");

    let body: Buffer;
    try {
      const response = await safeFetch(url.toString(), {
        headers: { "x-subscription-token": this.apiKey },
        accept: "application/json",
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 12_000,
        maxRedirects: 0,
      });
      body = response.body;
    } catch (error) {
      if (error instanceof FetchError && (error.status === 401 || error.status === 403)) {
        throw new SearchProviderError("auth", "Chave do provedor de busca recusada.");
      }
      if (error instanceof FetchError && error.status === 429) {
        throw new SearchProviderError("quota", "Limite do provedor de busca atingido.");
      }
      if (error instanceof UnsafeUrlError) {
        throw new SearchProviderError("config", "Endereço do provedor de busca inválido.");
      }
      // 400/422: parâmetro recusado pela API (não adianta repetir) — o código ajuda no diagnóstico.
      if (
        error instanceof FetchError &&
        error.status &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw new SearchProviderError(
          "config",
          `O provedor de busca recusou a consulta (HTTP ${error.status}).`,
        );
      }
      throw new SearchProviderError(
        "network",
        error instanceof FetchError && error.status
          ? `Falha ao consultar o provedor de busca (HTTP ${error.status}).`
          : "Falha ao consultar o provedor de busca.",
      );
    }

    let data: { web?: { results?: unknown[] }; query?: { more_results_available?: boolean } };
    try {
      data = JSON.parse(body.toString("utf-8"));
    } catch {
      throw new SearchProviderError("bad_response", "Resposta do provedor de busca inválida.");
    }
    const raw = Array.isArray(data.web?.results) ? data.web!.results! : [];
    const results: SearchResult[] = [];
    raw.forEach((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const link = typeof entry.url === "string" ? entry.url : "";
      let domain = "";
      try {
        domain = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        return;
      }
      results.push({
        title: clean(entry.title).slice(0, 300),
        url: link,
        snippet: clean(entry.description).slice(0, 1000),
        position: page * perPage + index + 1,
        domain,
        age: typeof entry.age === "string" ? entry.age.slice(0, 60) : null,
      });
    });
    return { results, hasMore: Boolean(data.query?.more_results_available) };
  }
}

/** Provedor configurado no ambiente (ou o motivo de não haver um). Nunca expõe a chave. */
export function searchProviderFromEnv(env: NodeJS.ProcessEnv = process.env): {
  provider: SearchProvider | null;
  problem: string | null;
} {
  const name = (env.WEB_SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const key = (env.WEB_SEARCH_API_KEY ?? "").trim();
  if (!name) {
    return {
      provider: null,
      problem:
        "Provedor de busca não configurado: defina WEB_SEARCH_PROVIDER e WEB_SEARCH_API_KEY no servidor.",
    };
  }
  if (name !== "brave") {
    return { provider: null, problem: `Provedor de busca desconhecido: "${name}".` };
  }
  if (key.length < 8) {
    return { provider: null, problem: "WEB_SEARCH_API_KEY ausente ou inválida." };
  }
  return { provider: new BraveSearchProvider(key), problem: null };
}

/** Limites da descoberta (controle de custo). Valores fora da faixa voltam ao padrão. */
export type DiscoveryLimits = {
  maxQueries: number;
  resultsPerQuery: number;
  maxCandidates: number;
  /** Intervalo mínimo entre consultas ao provedor (rate limiting). */
  minQueryIntervalMs: number;
  timeBudgetMs: number;
};

const bounded = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

export function discoveryLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): DiscoveryLimits {
  return {
    maxQueries: bounded(env.WEB_DISCOVERY_MAX_QUERIES, 6, 1, 30),
    resultsPerQuery: bounded(env.WEB_DISCOVERY_RESULTS_PER_QUERY, 10, 1, 20),
    maxCandidates: bounded(env.WEB_DISCOVERY_MAX_CANDIDATES, 8, 1, 30),
    minQueryIntervalMs: 1_100,
    timeBudgetMs: 50_000,
  };
}
