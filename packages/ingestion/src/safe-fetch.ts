import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { Agent, fetch, type Dispatcher } from "undici";
import { assertSafeUrl, isPublicAddress, UnsafeUrlError } from "./network-guard";

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Somente para testes automatizados: permite endereços locais. */
  allowPrivateNetworkForTests?: boolean;
};

export type FetchedResource = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
};

export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

const USER_AGENT = "LEP-Plataforma/1.0 (monitoramento de editais; contato: equipe LEP Filmes)";
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * DNS com validação: o IP é conferido no momento da conexão, o que também
 * protege contra "DNS rebinding" (domínio público que resolve para IP interno).
 */
function guardedLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: object,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      const list = addresses as LookupAddress[];
      const unsafe = list.find((entry) => !allowPrivate && !isPublicAddress(entry.address));
      if (unsafe || list.length === 0) {
        return callback(new UnsafeUrlError("Endereço de rede interna não permitido."), []);
      }
      const all = (options as { all?: boolean }).all;
      if (all) return callback(null, list);
      return callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

function createDispatcher(allowPrivate: boolean): Dispatcher {
  return new Agent({ connect: { lookup: guardedLookup(allowPrivate) as never }, connections: 4 });
}

/**
 * Baixa uma URL pública com proteções: SSRF, redirecionamentos revalidados,
 * tempo máximo e limite de tamanho (download interrompido ao exceder).
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<FetchedResource> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? 5;
  const allowPrivate = options.allowPrivateNetworkForTests === true;
  const dispatcher = createDispatcher(allowPrivate);
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);

  let url = allowPrivate ? new URL(rawUrl) : assertSafeUrl(rawUrl);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await fetch(url, {
        dispatcher,
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new FetchError("Redirecionamento sem destino.");
        const next = new URL(location, url).toString();
        url = allowPrivate ? new URL(next) : assertSafeUrl(next);
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new FetchError(`O site respondeu com erro (HTTP ${response.status}).`);
      }

      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        await response.body?.cancel();
        throw new FetchError("Arquivo maior que o limite permitido.");
      }

      const chunks: Buffer[] = [];
      let total = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          total += chunk.byteLength;
          if (total > maxBytes) {
            await response.body.cancel().catch(() => undefined);
            throw new FetchError("Arquivo maior que o limite permitido.");
          }
          chunks.push(Buffer.from(chunk));
        }
      }

      return {
        requestedUrl: rawUrl,
        finalUrl: url.toString(),
        status: response.status,
        contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
        body: Buffer.concat(chunks),
      };
    }
    throw new FetchError("Redirecionamentos demais.");
  } catch (error) {
    if (error instanceof FetchError || error instanceof UnsafeUrlError) throw error;
    const cause = (error as { cause?: unknown })?.cause;
    if (cause instanceof UnsafeUrlError) throw cause;
    if ((error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError") {
      throw new FetchError("O site demorou demais para responder.");
    }
    throw new FetchError("Não foi possível acessar o link.");
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}
