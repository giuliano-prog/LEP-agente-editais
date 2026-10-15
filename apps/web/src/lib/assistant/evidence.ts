/**
 * Evidências do Assistente LEP (ADR-0027) — funções puras.
 *
 * Regra central: inferência nunca vira fato. Uma conclusão "confirmada" a partir do edital
 * precisa de um trecho que EXISTA literalmente no texto do edital; documento e página são
 * tirados da posição real do trecho (não do que o modelo afirmou). Sem trecho verificável,
 * a confiança cai para "inferido" e o motivo volta para o agente.
 */

export const CONFIDENCE_VALUES = ["confirmed", "inferred", "not_found", "needs_human"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  confirmed: "Confirmado",
  inferred: "Inferido",
  not_found: "Não encontrado",
  needs_human: "Precisa de confirmação humana",
};

export const SOURCE_KINDS = ["edital", "lep", "production", "ai_inference", "team"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  edital: "Informação do edital",
  lep: "Informação da LEP",
  production: "Informação da produção",
  ai_inference: "Inferência da IA",
  team: "Informação da equipe",
};

export type PagedDocument = { label: string; pages: string[] };

export type Evidence = {
  documento: string | null;
  pagina: number | null;
  secao: string | null;
  trecho: string | null;
  analisado_em: string;
};

/** Minúsculas, sem acentos e com espaços normalizados — para comparar trechos. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type QuoteLocation = { documentLabel: string; page: number };

/** Onde o trecho aparece literalmente (documento e página, 1-based), ou null. */
export function locateQuote(documents: PagedDocument[], quote: string): QuoteLocation | null {
  const needle = normalizeForMatch(quote).replace(/…$/, "").trim();
  if (needle.length < 8) return null;
  for (const doc of documents) {
    for (let index = 0; index < doc.pages.length; index++) {
      if (normalizeForMatch(doc.pages[index] ?? "").includes(needle)) {
        return { documentLabel: doc.label, page: index + 1 };
      }
    }
    // Trecho que atravessa a quebra de página.
    const joined = normalizeForMatch(doc.pages.join(" "));
    if (joined.includes(needle)) {
      let offset = 0;
      const start = joined.indexOf(needle);
      for (let index = 0; index < doc.pages.length; index++) {
        offset += normalizeForMatch(doc.pages[index] ?? "").length + 1;
        if (offset > start) return { documentLabel: doc.label, page: index + 1 };
      }
    }
  }
  return null;
}

export type SearchHit = {
  documento: string;
  documento_indice: number;
  pagina: number;
  trecho: string;
};

/** Busca termos nas páginas (todos os termos na mesma página), com trecho em volta da 1ª ocorrência. */
export function searchPages(documents: PagedDocument[], query: string, limit = 12): SearchHit[] {
  const terms = normalizeForMatch(query)
    .split(/[^a-z0-9%$.,/-]+/)
    .filter((term) => term.length >= 3);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  documents.forEach((doc, docIndex) => {
    doc.pages.forEach((page, pageIndex) => {
      if (hits.length >= limit) return;
      const normalized = normalizeForMatch(page);
      if (!terms.every((term) => normalized.includes(term))) return;
      const position = normalized.indexOf(terms[0]!);
      const flat = page.replace(/\s+/g, " ");
      const start = Math.max(0, position - 200);
      hits.push({
        documento: doc.label,
        documento_indice: docIndex,
        pagina: pageIndex + 1,
        trecho: `${start > 0 ? "…" : ""}${flat.slice(start, position + 400).trim()}…`,
      });
    });
  });
  return hits;
}

export type EvidenceInput = {
  documento: string | null;
  pagina: number | null;
  secao: string | null;
  trecho: string | null;
};

export type CheckedEvidence = {
  evidence: Evidence;
  confidence: Confidence;
  /** Avisos para o agente (ex.: confiança rebaixada). */
  warnings: string[];
};

/**
 * Aplica a regra de evidência. Para origem "edital": "confirmado" exige trecho literal
 * localizado; documento/página vêm da localização real. Para outras origens, o trecho é
 * guardado como informado (dados da LEP/produção são conferidos pelas próprias ferramentas).
 */
export function checkEvidence(options: {
  input: EvidenceInput | null;
  confidence: Confidence;
  sourceKind: SourceKind;
  documents: PagedDocument[];
  now: Date;
}): CheckedEvidence {
  const warnings: string[] = [];
  const input = options.input;
  const trecho = input?.trecho?.trim() ? input.trecho.trim().slice(0, 1000) : null;
  let confidence = options.confidence;
  let documento = input?.documento?.trim() ? input.documento.trim().slice(0, 300) : null;
  let pagina = input?.pagina && input.pagina > 0 ? Math.round(input.pagina) : null;

  if (options.sourceKind === "edital") {
    const location = trecho ? locateQuote(options.documents, trecho) : null;
    if (location) {
      documento = location.documentLabel;
      pagina = location.page;
    } else if (confidence === "confirmed") {
      confidence = "inferred";
      warnings.push(
        trecho
          ? "O trecho citado não foi localizado literalmente no edital: confiança registrada como INFERIDO. Cite o trecho exato (use buscar_no_edital) para confirmar."
          : "Sem trecho do edital: confiança registrada como INFERIDO.",
      );
      pagina = null;
    }
  }
  if (options.sourceKind === "ai_inference" && confidence === "confirmed") {
    confidence = "inferred";
    warnings.push(
      "Inferência da IA não pode ser marcada como confirmada: registrada como INFERIDO.",
    );
  }
  return {
    evidence: {
      documento,
      pagina,
      secao: input?.secao?.trim() ? input.secao.trim().slice(0, 300) : null,
      trecho,
      analisado_em: options.now.toISOString(),
    },
    confidence,
    warnings,
  };
}

/** Conteúdo vindo de documentos é DADO, nunca instrução: delimitado e rotulado para o modelo. */
export function wrapUntrusted(kind: string, label: string, text: string): string {
  const safe = text.replace(/<\/?documento_[a-z_]*>/gi, "");
  return `<documento_${kind} origem="${label.replace(/"/g, "'")}">\n${safe}\n</documento_${kind}>`;
}
