/**
 * Elegibilidade territorial do proponente (diretriz LEP nº 1 — docs/diretrizes-lep.md).
 *
 * A LEP Filmes é sediada em São Paulo/SP e é sempre a proponente (diretriz nº 2:
 * empresas parceiras não contam para elegibilidade). Um edital é:
 *   • elegível  — federal/nacional, do estado de SP, do município de São Paulo, ou de
 *                 outro local que aceite proponentes de SP;
 *   • inelegível — exclusivo para proponentes sediados em outro estado/município;
 *   • desconhecido — o texto não permite concluir (verificação humana).
 *
 * Códigos de território (coluna core.editais.eligible_territories):
 *   "BR" = todo o país · "SP" = estado · "SP:São Paulo" = município.
 */

export type Territory = string;
export type Proponent = { state: string | null; city: string | null };

/** Sede da LEP Filmes (padrão quando a organização não tiver sede cadastrada). */
export const LEP_HEADQUARTERS: Proponent = { state: "SP", city: "São Paulo" };

const UF_BY_STATE: [string, string][] = [
  ["mato grosso do sul", "MS"],
  ["mato grosso", "MT"],
  ["rio grande do norte", "RN"],
  ["rio grande do sul", "RS"],
  ["rio de janeiro", "RJ"],
  ["sao paulo", "SP"],
  ["minas gerais", "MG"],
  ["espirito santo", "ES"],
  ["distrito federal", "DF"],
  ["santa catarina", "SC"],
  ["acre", "AC"],
  ["alagoas", "AL"],
  ["amapa", "AP"],
  ["amazonas", "AM"],
  ["bahia", "BA"],
  ["ceara", "CE"],
  ["goias", "GO"],
  ["maranhao", "MA"],
  ["para", "PA"],
  ["paraiba", "PB"],
  ["parana", "PR"],
  ["pernambuco", "PE"],
  ["piaui", "PI"],
  ["rondonia", "RO"],
  ["roraima", "RR"],
  ["sergipe", "SE"],
  ["tocantins", "TO"],
];

export const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** Gentílicos usados em editais ("produtoras cariocas") → território. */
const DEMONYMS: [RegExp, Territory][] = [
  [/\bpaulistan[ao]s?\b/, "SP:São Paulo"],
  [/\bpaulistas?\b/, "SP"],
  [/\bcariocas?\b/, "RJ:Rio de Janeiro"],
  [/\bfluminenses?\b/, "RJ"],
  [/\bmineir[ao]s?\b/, "MG"],
  [/\bbaian[ao]s?\b/, "BA"],
  [/\bgauch[ao]s?\b/, "RS"],
  [/\bpernambucan[ao]s?\b/, "PE"],
  [/\bcapixabas?\b/, "ES"],
  [/\bparanaenses?\b/, "PR"],
  [/\bcatarinenses?\b/, "SC"],
  [/\bgoian[ao]s?\b/, "GO"],
  [/\bcearenses?\b/, "CE"],
  [/\bbrasilienses?\b/, "DF"],
];

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "SP:São Paulo" → { state: "SP", city: "sao paulo" } (cidade normalizada). */
function parseTerritory(code: Territory): { state: string | null; city: string | null } {
  if (code.toUpperCase() === "BR") return { state: "BR", city: null };
  const [state, ...city] = code.split(":");
  return {
    state: (state ?? "").trim().toUpperCase() || null,
    city: city.length ? normalize(city.join(":").trim()) : null,
  };
}

export function territoryLabel(code: Territory): string {
  const { state, city } = parseTerritory(code);
  if (state === "BR") return "Todo o Brasil";
  const original = code.split(":").slice(1).join(":").trim();
  if (city) return `Município de ${original}${state ? `/${state}` : ""}`;
  return state ? `Estado de ${UF_NAMES[state] ?? state}` : code;
}

/** O proponente (sede) atende a pelo menos um território aceito? */
export function isProponentEligible(territories: Territory[], proponent: Proponent): boolean {
  return territories.some((code) => {
    const { state, city } = parseTerritory(code);
    if (state === "BR") return true;
    if (!proponent.state || state !== proponent.state.toUpperCase()) return false;
    return city === null || (proponent.city !== null && city === normalize(proponent.city));
  });
}

export type TerritoryAssessment = {
  verdict: "eligible" | "ineligible" | "unknown";
  /** Territórios aceitos identificados no texto. */
  territories: Territory[];
  reason: string;
  /** Trecho do texto que motivou a conclusão (rastreabilidade). */
  evidence: string | null;
};

const NATIONAL =
  /(todo o territorio nacional|em territorio nacional|todo o (brasil|pais)|de todo o pais|qualquer (estado|unidade da federacao|regiao do pais|municipio brasileiro)|ambito nacional|abrangencia nacional|todas as regioes do (brasil|pais)|sediad[ao]s? no brasil|com sede no brasil|estabelecid[ao]s? no brasil)/;

/** Termos que indicam exigência de sede/domicílio do proponente. */
const REQUIREMENT =
  /(sediad[ao]s?|com sede|tenham sede|possuam sede|sede (social )?(e foro )?|domiciliad[ao]s?|domicilio|residentes?|estabelecid[ao]s?|situad[ao]s?|exclusivamente (para|a|aos?|as)|restrit[ao]s? (a|aos?|as))/g;

function placesIn(window: string): Territory[] {
  const found: Territory[] = [];
  const city = window.match(
    /(?:municipio|cidade) d[eoa]s? ([a-z ]{3,40}?)(?=[,.;:()\n]| e | ou | que | com | ha | desde | por | no | na | pelo|$)/,
  );
  if (city?.[1]) {
    const name = city[1].trim();
    const uf = UF_BY_STATE.find(([state]) => state === name)?.[1] ?? null;
    // "município de São Paulo" / "cidade do Rio de Janeiro": capital homônima do estado.
    found.push(uf ? `${uf}:${UF_NAMES[uf]}` : `:${name}`);
  }
  const state = window.match(/(?:estado|unidade da federacao) d[eoa]s? ([a-z ]{3,30})/);
  if (state?.[1]) {
    const uf = UF_BY_STATE.find(([name]) => state[1]!.startsWith(name))?.[1];
    if (uf) found.push(uf);
  }
  if (/distrito federal/.test(window)) found.push("DF");
  // Sigla do estado após preposição: "com sede em SP", "no RJ".
  const uf = window.match(
    /\b(?:em|no|na|de|do|da) (ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b(?! [a-z]{3,})/,
  );
  if (uf?.[1]) found.push(uf[1].toUpperCase());
  for (const [pattern, territory] of DEMONYMS) if (pattern.test(window)) found.push(territory);
  return found;
}

/**
 * Lê o texto do edital e conclui a elegibilidade territorial da LEP.
 * Conservador: só declara "inelegível" quando há exigência explícita de sede/
 * domicílio em outro local e nenhuma indicação de abrangência nacional.
 */
export function assessTerritory(
  text: string,
  proponent: Proponent = LEP_HEADQUARTERS,
): TerritoryAssessment {
  const normalized = normalize(text).replace(/\s+/g, " ");
  const national = normalized.match(NATIONAL);

  const restrictions: { territory: Territory; evidence: string }[] = [];
  for (const match of normalized.matchAll(REQUIREMENT)) {
    const start = match.index ?? 0;
    const window = normalized.slice(start, start + 140);
    for (const territory of placesIn(window))
      restrictions.push({ territory, evidence: window.trim() });
  }

  // Gentílico junto ao proponente: "produtoras cariocas", "proponentes paulistas".
  for (const match of normalized.matchAll(
    /(proponentes?|produtoras?|empresas?|pessoas juridicas|realizador(?:es|as)?)( [a-z]+){0,2}/g,
  )) {
    const phrase = match[0];
    for (const [pattern, territory] of DEMONYMS) {
      if (pattern.test(phrase)) restrictions.push({ territory, evidence: phrase });
    }
  }

  if (restrictions.length === 0) {
    return national
      ? {
          verdict: "eligible",
          territories: ["BR"],
          reason: "Abrangência nacional.",
          evidence: national[0],
        }
      : {
          verdict: "unknown",
          territories: [],
          reason: "Restrição territorial não identificada no texto.",
          evidence: null,
        };
  }

  const territories = [...new Set(restrictions.map((item) => item.territory))];
  const matching = restrictions.find((item) => isProponentEligible([item.territory], proponent));
  if (matching) {
    return {
      verdict: "eligible",
      territories,
      reason: `Aceita proponentes de ${territoryLabel(matching.territory)}.`,
      evidence: matching.evidence,
    };
  }
  if (national) {
    // Ex.: cotas regionais dentro de um edital nacional.
    return {
      verdict: "eligible",
      territories: ["BR", ...territories],
      reason:
        "Abrangência nacional (há menções a outros territórios, como cotas regionais — verificar).",
      evidence: national[0],
    };
  }
  const first = restrictions[0]!;
  const place = first.territory.startsWith(":")
    ? `Município de ${first.territory.slice(1)}`
    : territoryLabel(first.territory);
  return {
    verdict: "ineligible",
    territories,
    reason: `Exclusivo para proponentes de ${place}; a LEP Filmes é sediada em ${proponent.city ?? "?"}/${proponent.state ?? "?"}.`,
    evidence: first.evidence,
  };
}
