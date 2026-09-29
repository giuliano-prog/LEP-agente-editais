/**
 * Famílias de consultas da descoberta web (ADR-0024).
 *
 * Nova família = nova entrada em QUERY_FAMILIES (o motor não muda). A prioridade só
 * organiza a execução dentro do limite de consultas por rodada; a rotação garante
 * que TODAS as consultas rodem ao longo das execuções — nenhuma fica escondida.
 */

export type QueryFamilyKey = "core" | "favorites" | "format" | "institutional";

export type DiscoveryQuery = { query: string; family: QueryFamilyKey; priority: number };

export type QueryContext = {
  year: number;
  /** Nomes/instituições das fontes favoritas ⭐ (prioridade, não exclusividade). */
  favorites: string[];
};

type QueryFamily = {
  key: QueryFamilyKey;
  label: string;
  /** 1 = mais alta. */
  priority: number;
  build: (context: QueryContext) => string[];
};

const CORE_TERMS = [
  "edital audiovisual",
  "edital cinema",
  "edital longa-metragem",
  "edital curta-metragem",
  "edital documentário",
  "edital série audiovisual",
  "chamada projetos audiovisuais",
  "fomento audiovisual",
  "produção audiovisual edital",
  "desenvolvimento audiovisual edital",
  "pós-produção audiovisual edital",
  "distribuição audiovisual edital",
  "prêmio audiovisual",
  "patrocínio audiovisual",
  "fundo audiovisual",
];

export const DISCOVERY_FORMATS = [
  "audiovisual",
  "cinema",
  "longa-metragem",
  "curta-metragem",
  "documentário",
  "série audiovisual",
  "série documental",
  "animação",
];

export const DISCOVERY_ACTIONS = [
  "edital",
  "fomento",
  "chamada",
  "patrocínio",
  "prêmio",
  "produção",
  "desenvolvimento",
  "distribuição",
];

const INSTITUTIONAL = [
  "ANCINE edital audiovisual",
  "FSA chamada pública audiovisual",
  "Spcine edital",
  "RioFilme edital",
  "secretaria de cultura edital audiovisual",
  "instituto cultural chamada audiovisual",
  "lei de incentivo patrocínio audiovisual",
  "laboratório de roteiro audiovisual inscrições",
];

export const QUERY_FAMILIES: QueryFamily[] = [
  {
    key: "core",
    label: "Termos audiovisuais",
    priority: 1,
    build: ({ year }) => CORE_TERMS.map((term) => `${term} ${year}`),
  },
  {
    key: "favorites",
    label: "Fontes favoritas",
    priority: 2,
    build: ({ year, favorites }) => favorites.map((name) => `${name} edital ${year}`),
  },
  {
    key: "format",
    label: "Formato + ação",
    priority: 3,
    build: ({ year }) =>
      DISCOVERY_FORMATS.flatMap((format) =>
        DISCOVERY_ACTIONS.map((action) => `${format} ${action} ${year}`),
      ),
  },
  {
    key: "institutional",
    label: "Instituições",
    priority: 3,
    build: ({ year }) => INSTITUTIONAL.map((term) => `${term} ${year}`),
  },
];

/** Todas as consultas, sem repetição, em ordem de prioridade. */
export function allDiscoveryQueries(context: QueryContext): DiscoveryQuery[] {
  const seen = new Set<string>();
  const queries: DiscoveryQuery[] = [];
  for (const family of [...QUERY_FAMILIES].sort((a, b) => a.priority - b.priority)) {
    for (const raw of family.build(context)) {
      const query = raw.replace(/\s+/g, " ").trim();
      const key = query.toLowerCase();
      if (!query || seen.has(key)) continue;
      seen.add(key);
      queries.push({ query, family: family.key, priority: family.priority });
    }
  }
  return queries;
}

/**
 * Consultas desta execução: as `pinned` primeiras (mais fortemente audiovisuais)
 * sempre; as vagas restantes percorrem o resto em rodízio (`rotation` = nº da
 * execução), de modo que todas as consultas sejam usadas ao longo do tempo.
 */
export function planDiscoveryQueries(
  context: QueryContext,
  { limit, rotation, pinned = 2 }: { limit: number; rotation: number; pinned?: number },
): DiscoveryQuery[] {
  const all = allDiscoveryQueries(context);
  const max = Math.max(0, Math.min(limit, all.length));
  const head = all.slice(0, Math.min(pinned, max));
  const rest = all.slice(head.length);
  const slots = max - head.length;
  if (slots <= 0 || rest.length === 0) return head;
  const start = (Math.max(0, rotation) * slots) % rest.length;
  const picked: DiscoveryQuery[] = [];
  for (let i = 0; i < Math.min(slots, rest.length); i++) {
    picked.push(rest[(start + i) % rest.length]!);
  }
  return [...head, ...picked];
}
