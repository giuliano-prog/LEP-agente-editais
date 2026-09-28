/**
 * Deduplicação multi-fonte (etapa 8): o mesmo edital pode aparecer no site do
 * órgão, num agregador (ex.: Prosas) e em notícias. Regras determinísticas:
 *
 *   mesmo número/ano ("Edital nº 5/2026") + títulos parecidos      → mesmo edital
 *   títulos quase iguais + mesmo prazo                              → mesmo edital
 *   títulos parecidos (sem número ou prazo que confirme)            → POSSÍVEL duplicado
 *
 * "Mesmo edital" vira avistamento (fonte extra) em vez de um edital novo.
 * "Possível duplicado" nunca esconde nada: o edital entra e a equipe decide.
 */
import { normalize } from "./territory";

export type Fingerprint = {
  /** "5/2026" (número/ano do edital), quando houver. */
  number: string | null;
  /** Palavras significativas do título (sem acentos, ordenadas, sem repetição). */
  tokens: string[];
  /** Prazo AAAA-MM-DD, quando houver. */
  deadline: string | null;
};

export type DuplicateMatch = {
  verdict: "same" | "possible" | "different";
  reason: string;
};

/** Palavras que não distinguem um edital de outro. */
const STOPWORDS = new Set(
  (
    "a o as os de da do das dos e em no na nos nas para por com sem ao aos um uma " +
    "edital editais chamada chamamento publica publico selecao processo programa premio concurso " +
    "credenciamento inscricoes inscricao aberto abertas n no numero pag pagina site oficial " +
    "municipal estadual federal nacional secretaria cultura fomento apoio lei"
  ).split(" "),
);

const NUMBER =
  /\b(?:edital|chamada|chamamento|premio|concurso|selecao|credenciamento|portaria)[^0-9]{0,30}?(?:n[ºo°.]*\s*)?(\d{1,4})\s*[/-]\s*(\d{4}|\d{2})\b/;

export function editalNumber(text: string): string | null {
  const m = normalize(text).replace(/\s+/g, " ").match(NUMBER);
  if (!m) return null;
  const year = m[2]!.length === 2 ? `20${m[2]}` : m[2]!;
  return `${Number(m[1])}/${year}`;
}

export function titleTokens(title: string): string[] {
  const words = normalize(title)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set(words)].sort();
}

export function fingerprint(input: {
  title: string;
  text?: string | null;
  deadline?: string | null;
}): Fingerprint {
  return {
    number:
      editalNumber(input.title) ?? (input.text ? editalNumber(input.text.slice(0, 3000)) : null),
    tokens: titleTokens(input.title),
    deadline: input.deadline ? input.deadline.slice(0, 10) : null,
  };
}

/** Semelhança entre conjuntos de palavras (0 a 1). */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((token) => setB.has(token)).length;
  return shared / (a.length + b.length - shared);
}

/** Chave para busca/índice: número/ano quando houver; senão as palavras do título. */
export function canonicalKey(print: Fingerprint): string | null {
  if (print.number) return `n:${print.number}`;
  return print.tokens.length >= 2 ? `t:${print.tokens.join("-")}` : null;
}

export function compareFingerprints(a: Fingerprint, b: Fingerprint): DuplicateMatch {
  const score = similarity(a.tokens, b.tokens);
  const percent = `${Math.round(score * 100)}%`;
  if (a.number && b.number && a.number !== b.number) {
    return { verdict: "different", reason: `números diferentes (${a.number} × ${b.number})` };
  }
  if (a.deadline && b.deadline && a.deadline !== b.deadline && score < 0.9) {
    return { verdict: "different", reason: "prazos diferentes" };
  }
  if (a.number && a.number === b.number && score >= 0.3) {
    return {
      verdict: "same",
      reason: `mesmo número (${a.number}) e títulos parecidos (${percent})`,
    };
  }
  if (score >= 0.8 && a.deadline && a.deadline === b.deadline) {
    return { verdict: "same", reason: `títulos quase iguais (${percent}) e mesmo prazo` };
  }
  if (score >= 0.6) return { verdict: "possible", reason: `títulos parecidos (${percent})` };
  return { verdict: "different", reason: `títulos diferentes (${percent})` };
}

export type KnownEdital = { id: string; title: string; print: Fingerprint };

/** Melhor correspondência entre os editais conhecidos ("same" antes de "possible"). */
export function findDuplicateEdital(
  candidate: Fingerprint,
  known: KnownEdital[],
): (DuplicateMatch & { id: string; title: string }) | null {
  let possible: (DuplicateMatch & { id: string; title: string }) | null = null;
  for (const edital of known) {
    const match = compareFingerprints(candidate, edital.print);
    if (match.verdict === "same") return { ...match, id: edital.id, title: edital.title };
    if (match.verdict === "possible" && !possible)
      possible = { ...match, id: edital.id, title: edital.title };
  }
  return possible;
}
