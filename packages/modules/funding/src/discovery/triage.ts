/**
 * Triagem dos resultados de busca (descoberta web, ADR-0024): o PRIMEIRO filtro,
 * barato, antes de baixar qualquer página. Palavras-chave aqui só descartam o
 * que claramente não é edital; a decisão audiovisual vem depois, lendo o conteúdo
 * (classifyAudiovisualRelevance).
 */
import { normalize } from "../territory";
import { classifyAudiovisualRelevance } from "./audiovisual";

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  /** Posição no ranking do provedor (1 = primeiro). */
  position: number;
};

export type SiteKind = "official" | "known_source" | "aggregator" | "news" | "unknown";

export type HitTriage =
  | { keep: true; url: string; host: string; siteKind: SiteKind; reason: string }
  | { keep: false; url: string | null; host: string | null; reason: string };

/** Domínios governamentais brasileiros (órgãos públicos). */
const GOV_SUFFIXES = [".gov.br", ".leg.br", ".jus.br", ".mp.br", ".def.br", ".tc.br"];

/** Redes sociais e vídeo: nunca são a fonte oficial do edital. */
const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "whatsapp.com",
  "t.me",
  "threads.net",
];

/** Agregadores conhecidos: ótimos para DESCOBRIR, mas não substituem a fonte oficial. */
export const KNOWN_AGGREGATOR_HOSTS = ["prosas.com.br"];

const NON_DOCUMENT = /\.(docx?|xlsx?|pptx?|odt|ods|zip|rar|7z|jpe?g|png|gif|mp4|mp3)$/i;
const NEWS_PATH = /\/(noticias?|news|blog|imprensa|sala-de-imprensa|artigos?|materias?)\//;

const EDITAL_TERMS =
  /\b(edita(l|is)|chamada|chamamento|selecao|concurso|premi\w+|fomento|credenciamento|programa|linha|inscric\w+|patrocinio|laboratorio|residencia)\b/;
/**
 * Sinais de PRODUTO audiovisual no resultado de busca (sem palavras ambíguas sozinhas:
 * "curta"/"longa" duração, "séries iniciais", roteiro turístico…).
 */
const AV_TERMS =
  /\b(audiovisua\w*|cinema\w*|cinematografic\w*|filmes?|longas?[- ]?metrage(m|ns)|curtas?[- ]?metrage(m|ns)|medias?[- ]?metrage(m|ns)|documentari\w+|documenta(l|is)|series? (audiovisua\w*|documenta\w*|de ficcao|de animacao|de tv|televisiva\w*)|webseries?|telefilmes?|animac(ao|oes)|videoclipes?|roteiros? (de|para) (cinema|filme|longa|curta|serie|audiovisual)|ancine|fsa|fundo setorial do audiovisual|spcine|riofilme)\b/;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const endsWithHost = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

export const isGovHost = (host: string) => GOV_SUFFIXES.some((suffix) => host.endsWith(suffix));
export const isSocialHost = (host: string) => SOCIAL_HOSTS.some((s) => endsWithHost(host, s));
export const isAggregatorHost = (host: string, extra: string[] = []) =>
  [...KNOWN_AGGREGATOR_HOSTS, ...extra].some((s) => endsWithHost(host, s));

export function siteKindOf(
  url: string,
  { knownHosts = new Set<string>(), aggregatorHosts = [] as string[] } = {},
): SiteKind {
  const host = hostOf(url) ?? "";
  if (isAggregatorHost(host, aggregatorHosts)) return "aggregator";
  if (knownHosts.has(host)) return "known_source";
  if (isGovHost(host)) return "official";
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    // mantém vazio
  }
  if (NEWS_PATH.test(`${path}/`)) return "news";
  return "unknown";
}

/** Primeiro filtro de um resultado de busca (sem baixar nada). */
export function triageSearchHit(
  hit: SearchHit,
  options: { knownHosts?: Set<string>; aggregatorHosts?: string[] } = {},
): HitTriage {
  let url: URL;
  try {
    url = new URL(hit.url);
  } catch {
    return { keep: false, url: null, host: null, reason: "endereço inválido" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { keep: false, url: null, host: null, reason: "protocolo não permitido" };
  }
  url.hash = "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const clean = url.toString();
  if (isSocialHost(host)) {
    return { keep: false, url: clean, host, reason: "rede social (não é fonte oficial)" };
  }
  if (NON_DOCUMENT.test(url.pathname)) {
    return { keep: false, url: clean, host, reason: "arquivo que não é página nem PDF" };
  }
  const described = normalize(
    `${hit.title} ${hit.snippet} ${decodeURIComponent(url.pathname).replace(/[-_/]+/g, " ")}`,
  );
  const edital = EDITAL_TERMS.test(described);
  const av = AV_TERMS.test(described);
  if (!edital && !av) {
    return { keep: false, url: clean, host, reason: "sem termos de edital nem de audiovisual" };
  }
  if (!edital) {
    return { keep: false, url: clean, host, reason: "sem indício de edital/chamada/prêmio" };
  }
  // "Edital cultural" não é sinônimo de audiovisual: sem sinal de produto audiovisual no
  // título, trecho ou endereço, o resultado não é baixado.
  if (!av) {
    return { keep: false, url: clean, host, reason: "sem sinal de produto audiovisual" };
  }
  // O próprio trecho já mostra objeto de outra natureza (ex.: teatro com registro audiovisual).
  const cheap = classifyAudiovisualRelevance({ title: hit.title, text: hit.snippet });
  if (cheap.relevance === "no") {
    return {
      keep: false,
      url: clean,
      host,
      reason: `objeto não audiovisual no resultado (${cheap.reasons[0]})`.slice(0, 300),
    };
  }
  return {
    keep: true,
    url: clean,
    host,
    siteKind: siteKindOf(clean, options),
    reason: "termos de edital e de produto audiovisual",
  };
}
