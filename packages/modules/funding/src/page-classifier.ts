/**
 * Classificador de páginas encontradas pela varredura (sem IA, regras explicáveis).
 *
 * Responde "esta página É uma oportunidade (edital, chamada, prêmio…)?" antes de
 * criar um edital. Conservador: na dúvida, "incerta" — a página entra para revisão
 * humana. Só páginas claramente de outro tipo (resultado, retificação, notícia,
 * institucional, índice de editais) são deixadas de fora, com o motivo registrado.
 */
import { normalize } from "./territory";

export const PAGE_TYPES = [
  "opportunity",
  "uncertain",
  "listing",
  "result",
  "rectification",
  "news",
  "institutional",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  opportunity: "Oportunidade",
  uncertain: "Incerta (revisar)",
  listing: "Lista de editais",
  result: "Resultado / homologação",
  rectification: "Retificação / errata",
  news: "Notícia",
  institutional: "Página institucional",
};

/** Tipos que viram edital (os demais são registrados como páginas ignoradas). */
export const IMPORTABLE_PAGE_TYPES = new Set<PageType>(["opportunity", "uncertain"]);

export const OPPORTUNITY_KINDS = [
  "edital",
  "call",
  "award",
  "contest",
  "accreditation",
  "selection",
  "program",
  "festival",
  "lab",
  "other",
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_KIND_LABELS: Record<OpportunityKind, string> = {
  edital: "Edital",
  call: "Chamada / chamamento público",
  award: "Prêmio",
  contest: "Concurso",
  accreditation: "Credenciamento",
  selection: "Seleção / processo seletivo",
  program: "Programa / linha de fomento",
  festival: "Festival / mostra",
  lab: "Laboratório / residência",
  other: "Outro",
};

export type PageClassification = {
  type: PageType;
  kind: OpportunityKind | null;
  /** Sinais encontrados (explicação em pt-BR). */
  reasons: string[];
};

export type PageInput = {
  title: string;
  url: string;
  text: string;
  /** Quantos links da página parecem editais (índices têm vários). */
  editalLinkCount?: number;
};

const RESULT =
  /^(resultado|homologa\w*|lista (final )?de (selecionad|contemplad|habilitad|inscrit)\w*|classifica\w* (final|preliminar)|selecionad\w+ (do|da|no|na)\b)/;
const RECTIFICATION = /^(retifica\w*|errata|aditivo|republica\w*|prorroga\w*)/;
const INSTITUTIONAL =
  /\b(programa de integridade|integridade|ouvidoria|transparencia|lgpd|protecao de dados|politica de privacidade|quem somos|sobre nos|fale conosco|contato|codigo de (conduta|etica)|canal de denuncias?|licitac\w+|pregao|compras publicas|concurso publico para (cargo|provimento)|processo seletivo (simplificado )?(para|de) (estagi\w+|servidor\w*|contrata\w+|vagas?)|vagas? de (emprego|estagio)|trabalhe conosco)\b/;
const NEWS_URL = /\/(noticias?|news|blog|imprensa|sala-de-imprensa|artigos?)\//;

const SIGNALS: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /(inscri\w+ (abertas?|ate|de \d|no periodo|pelo|pela|gratuitas?)|periodo de inscri\w+|prazo (para|de|final)( as)? inscri\w+|as inscri\w+ (vao|ficam|estarao|podem))/,
    reason: "período de inscrição",
  },
  {
    pattern: /\bregulamento\b|\bedital (n[ºo°.]|numero|de chamamento|de selecao)/,
    reason: "regulamento/edital",
  },
  {
    pattern: /\bproponentes?\b|\bpodem participar\b|\bpoderao participar\b|\belegiveis\b/,
    reason: "quem pode participar",
  },
  { pattern: /r\$ ?\d/, reason: "valor em R$" },
  {
    pattern:
      /\b(objeto|finalidade) (do|deste|desta|da) (edital|chamada|chamamento|premio|concurso|selecao)\b/,
    reason: "objeto do edital",
  },
  {
    pattern:
      /\b(documentos? (necessarios|exigidos|obrigatorios)|ficha de inscri\w+|formulario de inscri\w+)\b/,
    reason: "documentos de inscrição",
  },
];

const KIND_RULES: [RegExp, OpportunityKind][] = [
  [/\bcredenciamento\b/, "accreditation"],
  [/\b(chamada|chamamento)\b/, "call"],
  [/\bpremi(o|os|acao)\b/, "award"],
  [/\bconcurso\b/, "contest"],
  [/\b(laboratorio|lab|residencia|incubadora)\b/, "lab"],
  [/\b(festival|mostra)\b/, "festival"],
  [/\bedita(l|is)\b/, "edital"],
  [/\b(selecao|processo seletivo)\b/, "selection"],
  [/\b(programa|linha|fomento)\b/, "program"],
];

export function opportunityKind(title: string): OpportunityKind {
  const normalized = normalize(title);
  return KIND_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? "other";
}

export function classifyPage({
  title,
  url,
  text,
  editalLinkCount = 0,
}: PageInput): PageClassification {
  const normalizedTitle = normalize(title).trim();
  const body = normalize(text).replace(/\s+/g, " ");
  let path = "";
  try {
    path = normalize(decodeURIComponent(new URL(url).pathname));
  } catch {
    // URL inválida: segue só com título e texto
  }
  const slug = path.replace(/[-_/]+/g, " ").trim();

  const lastSegment = path.split("/").filter(Boolean).pop() ?? "";
  if (RESULT.test(normalizedTitle) || /^(resultado|homologa)/.test(lastSegment)) {
    return { type: "result", kind: null, reasons: ["título indica resultado/homologação"] };
  }
  if (RECTIFICATION.test(normalizedTitle)) {
    return { type: "rectification", kind: null, reasons: ["título indica retificação/errata"] };
  }
  const institutional = `${normalizedTitle} ${slug}`.match(INSTITUTIONAL);
  if (institutional) {
    return {
      type: "institutional",
      kind: null,
      reasons: [`página institucional (“${institutional[0]}”)`],
    };
  }

  const signals = SIGNALS.filter(({ pattern }) => pattern.test(body)).map(({ reason }) => reason);
  const kind = opportunityKind(title);

  if (NEWS_URL.test(`${path}/`) && signals.length < 3) {
    return { type: "news", kind: null, reasons: ["endereço de notícia/blog", ...signals] };
  }
  if (editalLinkCount >= 4 && !signals.includes("período de inscrição")) {
    return {
      type: "listing",
      kind: null,
      reasons: [`página com ${editalLinkCount} links de editais (índice)`],
    };
  }
  if (signals.length >= 2) return { type: "opportunity", kind, reasons: signals };
  // Texto curto (ex.: página montada por script): não dá para concluir.
  if (body.length < 200) {
    return {
      type: "uncertain",
      kind,
      reasons: ["pouco texto na página para concluir", ...signals],
    };
  }
  return {
    type: "uncertain",
    kind,
    reasons: signals.length > 0 ? signals : ["nenhum sinal claro de edital no texto"],
  };
}
