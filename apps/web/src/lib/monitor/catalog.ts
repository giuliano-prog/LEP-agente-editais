import { sourceAdapterSchema, type SourceAdapter } from "@lep/funding";

/**
 * Catálogo de NOVAS fontes (etapa 11), só por configuração.
 *
 * - Sem seletores CSS/XPath: só regras simples do adaptador (exclusões por
 *   endereço/título), validadas por `sourceAdapterSchema`.
 * - O ENDEREÇO da página de listagem não vem preenchido: quem administra cola a
 *   página oficial (nenhum endereço inventado), testa ("Testar fonte") e só então
 *   ativa. Fontes do catálogo entram PAUSADAS.
 */
export type CatalogKind = "federal" | "state" | "fund" | "aggregator" | "sponsor";

export type CatalogEntry = {
  key: string;
  name: string;
  agency: string;
  kind: CatalogKind;
  /** true: tudo na fonte é audiovisual; false: a varredura exige termos de audiovisual. */
  audiovisualOnly: boolean;
  adapter: SourceAdapter;
  /** Onde encontrar a página de listagem e cuidados conhecidos. */
  notes: string;
};

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  federal: "Federal",
  state: "Estadual (SP)",
  fund: "Fundo",
  aggregator: "Agregador",
  sponsor: "Patrocinador",
};

const adapter = (raw: unknown) => sourceAdapterSchema.parse(raw);

export const SOURCE_CATALOG: CatalogEntry[] = [
  {
    key: "sp-sceic",
    name: "Cultura SP (SCEIC) — Editais",
    agency: "Secretaria da Cultura, Economia e Indústria Criativas de SP",
    kind: "state",
    audiovisualOnly: false,
    adapter: adapter({ linkExcludes: ["/resultado", "/noticia"], titleExcludes: ["resultado"] }),
    notes:
      "Editais estaduais de SP (ex.: ProAC). Publica editais de várias linguagens: a varredura só considera links com termos de audiovisual. Cole a página oficial de editais da secretaria.",
  },
  {
    key: "minc",
    name: "Ministério da Cultura (MinC) — Editais",
    agency: "Ministério da Cultura",
    kind: "federal",
    audiovisualOnly: false,
    adapter: adapter({ linkExcludes: ["/noticias/", "/resultado"], titleExcludes: ["resultado"] }),
    notes:
      "Editais federais (inclui programas com recursos repassados). Muitas linguagens: só entram links com termos de audiovisual. Cole a página oficial de editais do ministério (gov.br).",
  },
  {
    key: "brde-fsa",
    name: "BRDE — Fundo Setorial do Audiovisual (FSA)",
    agency: "BRDE / FSA",
    kind: "fund",
    audiovisualOnly: true,
    adapter: adapter({ linkExcludes: ["/resultado"], titleExcludes: ["resultado"] }),
    notes:
      "Chamadas do FSA operadas pelo BRDE. Fonte exclusiva de audiovisual. Duplicados de editais vistos na ANCINE viram avistamentos (etapa 8).",
  },
  {
    key: "prosas",
    name: "Prosas — Editais abertos",
    agency: "Prosas (agregador)",
    kind: "aggregator",
    audiovisualOnly: false,
    adapter: adapter({ maxImports: 3, titleExcludes: ["encerrad"] }),
    notes:
      "Agregador de editais de vários órgãos e empresas. Partes do site podem exigir login (não são acessadas) ou ser montadas por JavaScript (a varredura lê só o HTML): teste antes de ativar. Editais já cadastrados por outra fonte viram avistamentos.",
  },
  {
    key: "sponsor",
    name: "Programa de patrocínio — (nome da empresa)",
    agency: "(empresa patrocinadora)",
    kind: "sponsor",
    audiovisualOnly: false,
    adapter: adapter({ maxImports: 2, linkExcludes: ["/noticias/", "/imprensa/"] }),
    notes:
      "Modelo para programas de patrocínio cultural de empresas (uma fonte por programa). Ajuste o nome e a instituição e cole a página oficial das chamadas.",
  },
];

export function catalogEntry(key: string): CatalogEntry | null {
  return SOURCE_CATALOG.find((entry) => entry.key === key) ?? null;
}
