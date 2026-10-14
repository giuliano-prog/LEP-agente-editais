/**
 * Ponto de integração FUTURA de IA na Área de Trabalho do Edital (ADR-0026) — SEM fornecedor.
 *
 * O que a IA poderá fazer quando a LEP decidir: revisar os rascunhos dos textos frente
 * aos critérios do edital, sugerir itens do checklist que as regras não encontraram e
 * apontar inconsistências em linguagem natural. Até lá vale `NoopWorkspaceReviewer`
 * (`enabled = false`): NADA é enviado e a Área de Trabalho segue pelas regras
 * determinísticas de `@lep/funding` (workspace/*).
 *
 * Diferente do `EditalAnalyzer` (que só envia o edital), aqui entrariam TEXTOS DA LEP
 * (dados sigilosos). Por isso não há adaptador de fornecedor: ligá-lo exige decisão
 * explícita da LEP (fornecedor, contrato de dados, custo) e revisão deste contrato.
 *
 * Toda resposta futura passa por `validateWorkspaceReview`:
 *  · sugestão de item sem trecho literal do edital é descartada (sem alucinação);
 *  · nenhuma afirmação de aprovação ("será aprovado", "chance de aprovação"…);
 *  · a IA nunca marca item como concluído nem decide elegibilidade.
 */
import { APPROVAL_CLAIM } from "./edital-analyzer";

export type WorkspaceReviewInput = {
  editalTitle: string;
  /** Texto do edital (regulamento/página) usado para conferir os trechos citados. */
  editalText: string;
  criteria: string[];
  texts: { itemId: string; title: string; content: string; charLimit: number | null }[];
};

export type ReviewSuggestion = {
  kind: "missing_item" | "text_feedback" | "inconsistency";
  title: string;
  detail: string;
  itemId?: string;
  /** Trecho literal do edital que fundamenta a sugestão (obrigatório para missing_item). */
  quote?: string;
};

export type WorkspaceReview = { suggestions: ReviewSuggestion[]; warnings: string[] };

export interface WorkspaceReviewer {
  readonly enabled: boolean;
  review(input: WorkspaceReviewInput): Promise<WorkspaceReview>;
}

/** Padrão: IA desligada — nada sai da plataforma. */
export class NoopWorkspaceReviewer implements WorkspaceReviewer {
  readonly enabled = false;
  async review(): Promise<WorkspaceReview> {
    return { suggestions: [], warnings: [] };
  }
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** Regras da LEP aplicadas a qualquer resposta de IA da Área de Trabalho. */
export function validateWorkspaceReview(
  raw: WorkspaceReview,
  input: Pick<WorkspaceReviewInput, "editalText">,
): WorkspaceReview {
  const source = squash(input.editalText);
  const warnings = [...raw.warnings];
  const suggestions = raw.suggestions.filter((suggestion) => {
    if (APPROVAL_CLAIM.test(`${suggestion.title} ${suggestion.detail}`)) {
      warnings.push("Afirmação sobre aprovação removida: a plataforma nunca prevê aprovação.");
      return false;
    }
    if (suggestion.kind === "missing_item") {
      const quote = suggestion.quote ? squash(suggestion.quote) : "";
      if (quote.length < 10 || !source.includes(quote)) {
        warnings.push(
          `Sugestão sem trecho verificável no edital descartada: “${suggestion.title}”.`,
        );
        return false;
      }
    }
    return true;
  });
  return { suggestions, warnings };
}

export function getWorkspaceReviewer(): WorkspaceReviewer {
  return new NoopWorkspaceReviewer();
}
