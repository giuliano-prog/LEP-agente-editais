/**
 * "Pergunte sobre este edital" — CONTRATO para uma função futura (sem fornecedor, sem UI).
 *
 * Direção: responder perguntas sobre UM edital usando só trechos do próprio documento
 * (RAG: o texto é dividido em trechos, os mais relevantes vão para o modelo). Regras que
 * qualquer implementação deve seguir (as mesmas de `EditalAnalyzer`):
 * - toda resposta cita os trechos usados; resposta sem trecho = "não encontrei no edital";
 * - nunca afirmar aprovação ou chance de aprovação;
 * - "não elegível" só por decisão humana;
 * - dados de produções da LEP não são enviados ao fornecedor.
 */

/** Trecho do edital usado como contexto (ex.: página do PDF). */
export type EditalChunk = { id: string; text: string; label?: string };

export type EditalQuestion = {
  editalTitle: string;
  question: string;
  chunks: EditalChunk[];
};

export type EditalAnswer = {
  /** null = não há resposta (sem IA configurada ou nada encontrado no edital). */
  answer: string | null;
  /** Trechos que sustentam a resposta (ids de `chunks`). */
  citations: string[];
  warnings: string[];
};

export interface EditalQuestionAnswerer {
  readonly name: string;
  readonly enabled: boolean;
  ask(input: EditalQuestion): Promise<EditalAnswer>;
}

/** Padrão atual: nenhuma IA configurada — nada é enviado a ninguém. */
export class NoopEditalQuestionAnswerer implements EditalQuestionAnswerer {
  readonly name = "sem-ia";
  readonly enabled = false;

  async ask(): Promise<EditalAnswer> {
    return {
      answer: null,
      citations: [],
      warnings: ["Nenhum fornecedor de IA configurado para perguntas sobre editais."],
    };
  }
}

/** Divide o texto em trechos (base do RAG); quebra em parágrafos, sem cortar palavras. */
export function chunkEditalText(text: string, maxChars = 1200): EditalChunk[] {
  const paragraphs = text
    .split(/\n{2,}|\n(?=\s*(?:\d+(?:\.\d+)*[.)]?|art\.?|[a-z]\))\s)/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: EditalChunk[] = [];
  let current = "";
  const push = () => {
    if (current) chunks.push({ id: `t${chunks.length + 1}`, text: current });
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxChars) push();
    if (paragraph.length > maxChars) {
      for (const word of paragraph.split(" ")) {
        if (current && current.length + word.length + 1 > maxChars) push();
        current = current ? `${current} ${word}` : word;
      }
      continue;
    }
    current = current ? `${current} ${paragraph}` : paragraph;
  }
  push();
  return chunks;
}
