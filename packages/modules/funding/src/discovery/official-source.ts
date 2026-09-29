/**
 * Resolvedor da fonte oficial (descoberta web, ADR-0024).
 *
 * Um agregador, notícia ou blog DESCOBRE a oportunidade; a referência principal
 * deve ser a página da instituição responsável sempre que puder ser encontrada.
 * Regras simples e explicáveis sobre os links da página descoberta.
 */
import { normalize } from "../territory";
import { hostOf, isAggregatorHost, isGovHost, isSocialHost } from "./triage";

export type OfficialLink = { url: string; host: string; reason: string; score: number };

const ANCHOR =
  /\b(site oficial|pagina oficial|edital|regulamento|chamada|chamamento|inscri\w+|saiba mais|acesse|mais informac\w+|link oficial|documento oficial)\b/;
const PATH = /(edita|chamad|chamament|regulament|premi|selec|fomento|inscric|convocatori)/;

/**
 * Melhor link para a fonte oficial numa página de agregador/notícia, ou null.
 * Considera só links para OUTROS domínios (não redes sociais nem agregadores).
 */
export function findOfficialLink(
  page: { url: string; links: { text: string; url: string }[] },
  { aggregatorHosts = [] as string[] } = {},
): OfficialLink | null {
  const pageHost = hostOf(page.url);
  let best: OfficialLink | null = null;
  for (const link of page.links) {
    const host = hostOf(link.url);
    if (!host || host === pageHost) continue;
    if (!/^https?:/i.test(link.url)) continue;
    if (isSocialHost(host) || isAggregatorHost(host, aggregatorHosts)) continue;
    let path = "";
    try {
      path = normalize(decodeURIComponent(new URL(link.url).pathname));
    } catch {
      continue;
    }
    if (path === "/" || path === "") continue;
    const anchor = normalize(link.text);
    const reasons: string[] = [];
    let score = 0;
    if (isGovHost(host)) {
      score += 3;
      reasons.push("domínio governamental");
    }
    if (ANCHOR.test(anchor)) {
      score += 2;
      reasons.push(`texto do link (“${link.text.trim().slice(0, 60)}”)`);
    }
    if (PATH.test(path)) {
      score += 2;
      reasons.push("endereço de edital/chamada");
    }
    if (/\.pdf$/i.test(path)) score += 1;
    if (score < 3) continue;
    if (!best || score > best.score) {
      best = { url: link.url, host, score, reason: reasons.join(", ") };
    }
  }
  return best;
}

/** Nome provável da instituição: sufixo do título da página ("Edital X | Spcine") ou o domínio. */
export function institutionName(pageTitle: string | null | undefined, url: string): string {
  const parts = (pageTitle ?? "")
    .split(/\s[|–—-]\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.length > 1 ? parts.at(-1)! : null;
  if (last && last.length >= 2 && last.length <= 80) return last;
  return hostOf(url) ?? url;
}
