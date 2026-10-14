/**
 * Checklist da inscrição gerado a partir do edital (ADR-0026).
 *
 * Cada item gerado tem `sourceKey` estável: regerar o checklist (ex.: depois de uma
 * retificação) só ACRESCENTA o que é novo — nunca apaga nem desfaz o trabalho da
 * equipe (status, responsável, texto). Itens manuais convivem com os gerados.
 */
import type { Edital } from "../edital";
import { normalize } from "../territory";
import type { ItemCategory, ItemRequirement } from "./model";
import { cleanListItem, knownText, stableKey, type WorkspaceRules } from "./rules";

export type ChecklistSeed = {
  sourceKey: string;
  category: ItemCategory;
  title: string;
  description: string | null;
  requirement: ItemRequirement;
  evidence: string | null;
  charLimit: number | null;
  wordLimit: number | null;
  pageLimit: number | null;
};

const MAX_TITLE = 300;

const title = (text: string) => {
  const clean = cleanListItem(text);
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean;
};

/** Documentos que, na prática, são textos a redigir (viram item de texto, não de documento). */
const isTextDocument = (normalized: string) =>
  knownText(normalized) !== null &&
  !/(certidao|comprovante|declaracao|contrato|cnpj|registro)/.test(normalized);

export function buildChecklistSeeds(edital: Edital, rules: WorkspaceRules): ChecklistSeed[] {
  const seeds = new Map<string, ChecklistSeed>();
  const add = (
    seed: Omit<ChecklistSeed, "charLimit" | "wordLimit" | "pageLimit"> &
      Partial<Pick<ChecklistSeed, "charLimit" | "wordLimit" | "pageLimit">>,
  ) => {
    // A mesma cláusula não vira dois itens (ex.: "termo de cessão" na documentação e nos direitos).
    const titleKey = normalize(seed.title)
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seeds.has(seed.sourceKey) || seed.title.length < 2 || titles.has(titleKey)) return;
    titles.add(titleKey);
    seeds.set(seed.sourceKey, { charLimit: null, wordLimit: null, pageLimit: null, ...seed });
  };
  const titles = new Set<string>();

  // Elegibilidade da proponente (sempre a LEP): na dúvida, vira item a confirmar.
  if (edital.eligibilityStatus !== "eligible") {
    add({
      sourceKey: "eligibility:lep",
      category: "eligibility",
      title: "Confirmar a elegibilidade da LEP como proponente",
      description: edital.eligibilityReason,
      requirement: "mandatory",
      evidence: edital.eligibilityEvidence,
    });
  }

  // Textos com limite (sinopse até X caracteres...) e textos citados sem limite.
  for (const limit of rules.textLimits) {
    add({
      sourceKey: `text:${limit.key}`,
      category: "text",
      title: limit.label,
      description: null,
      requirement: "mandatory",
      evidence: limit.evidence.snippet,
      charLimit: limit.charLimit,
      wordLimit: limit.wordLimit,
      pageLimit: limit.pageLimit,
    });
  }
  for (const item of rules.texts) {
    add({
      sourceKey: `text:${item.key}`,
      category: "text",
      title: item.label,
      description: null,
      requirement: "mandatory",
      evidence: item.evidence.snippet,
    });
  }

  for (const rule of rules.rights) {
    add({
      sourceKey: stableKey("rights", rule.text),
      category: "rights",
      title: title(rule.text),
      description: "Exigência de direitos/autorizações identificada no edital.",
      requirement: "mandatory",
      evidence: rule.evidence.snippet,
    });
  }
  for (const rule of rules.team) {
    add({
      sourceKey: stableKey("team", rule.text),
      category: "team",
      title: title(rule.text),
      description: "Exigência sobre equipe/profissionais identificada no edital.",
      requirement: "mandatory",
      evidence: rule.evidence.snippet,
    });
  }

  // Orçamento: valores sempre; planilha/cronograma/contrapartida quando o edital pede.
  add({
    sourceKey: "budget:values",
    category: "budget",
    title: "Definir valor solicitado e orçamento total do projeto",
    description:
      "Preencha os valores na seção Orçamento: a plataforma confere teto, faixa e contrapartida.",
    requirement: "mandatory",
    evidence: null,
  });
  for (const rule of rules.budget) {
    add({
      sourceKey: stableKey("budget", rule.text),
      category: "budget",
      title: title(rule.text),
      description: null,
      requirement: "mandatory",
      evidence: rule.evidence.snippet,
    });
  }

  for (const rule of rules.bonus) {
    add({
      sourceKey: stableKey("bonus", rule.text),
      category: "other",
      title: title(rule.text),
      description: "Possível pontuação adicional: verifique se a LEP/produção se enquadra.",
      requirement: "bonus",
      evidence: rule.evidence.snippet,
    });
  }

  // Documentos (por último): os do cadastro + os trechos de documentação do regulamento que
  // não foram classificados acima como direitos, equipe, orçamento ou bônus.
  const documents = [
    ...edital.requiredDocuments.map((text) => ({ text, evidence: null as string | null })),
    ...rules.documents.map((item) => ({ text: item.text, evidence: item.evidence.snippet })),
  ];
  for (const doc of documents) {
    const key = normalize(doc.text);
    const asText = isTextDocument(key) ? knownText(key) : null;
    if (asText) {
      add({
        sourceKey: `text:${asText.key}`,
        category: "text",
        title: asText.label,
        description: title(doc.text),
        requirement: "mandatory",
        evidence: doc.evidence,
      });
      continue;
    }
    add({
      sourceKey: stableKey("doc", doc.text),
      category: /(cessao|direito|anuencia|autorizacao)/.test(key) ? "rights" : "document",
      title: title(doc.text),
      description: null,
      requirement: "mandatory",
      evidence: doc.evidence,
    });
  }

  if (rules.criteria.length > 0) {
    add({
      sourceKey: "criteria:review",
      category: "other",
      title: "Revisar a proposta frente aos critérios de avaliação",
      description: `${rules.criteria.length} critério(s) identificado(s) — veja a seção Critérios de avaliação.`,
      requirement: "optional",
      evidence: null,
    });
  }

  return [...seeds.values()];
}

/** Só os itens que ainda não existem na área de trabalho (regerar não duplica). */
export function newSeeds(
  seeds: ChecklistSeed[],
  existingKeys: Iterable<string | null>,
): ChecklistSeed[] {
  const existing = new Set([...existingKeys].filter(Boolean));
  return seeds.filter((seed) => !existing.has(seed.sourceKey));
}
