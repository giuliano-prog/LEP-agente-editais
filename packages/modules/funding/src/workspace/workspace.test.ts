import { describe, expect, it } from "vitest";
import { toEdital } from "../edital";
import type { MatchResult } from "../match";
import { buildChecklistSeeds, newSeeds } from "./checklist";
import type { OrgDocument, WorkspaceItem } from "./model";
import { assessWorkspace, measureText, type AssessInput } from "./readiness";
import { extractWorkspaceRules, parseWorkspaceRules, EMPTY_RULES } from "./rules";

// Edital FICTÍCIO (nenhum dado real).
const EDITAL_TEXT = `EDITAL Nº 9/2026 — CHAMADA FICTÍCIA DE PRODUÇÃO
Fundação Exemplo de Cinema
O presente edital tem por objeto selecionar projetos de longa-metragem documental.
DA INSCRIÇÃO
O proponente deverá apresentar no formulário de inscrição:
a) Sinopse com até 1.500 caracteres, incluindo espaços.
b) Argumento com no máximo 5 (cinco) páginas.
c) Justificativa de no máximo 300 palavras.
d) Plano de distribuição e proposta de acessibilidade.
DA DOCUMENTAÇÃO
I - Certidão negativa de débitos federais;
II - Comprovante de registro da empresa na Ancine;
III - Contrato social e últimas alterações;
IV - Termo de cessão de direitos do roteiro assinado pelo autor.
DO ORÇAMENTO
A planilha orçamentária deverá acompanhar o cronograma físico-financeiro.
A contrapartida mínima de 10% do valor total do projeto deverá ser comprovada.
As despesas administrativas ficam limitadas a 15% do orçamento.
DOS CRITÉRIOS DE AVALIAÇÃO
Qualidade artística do projeto: até 30 pontos.
Viabilidade técnica e orçamentária: até 25 pontos.
Currículo da equipe: até 20 pontos.
Projetos dirigidos por pessoas negras ou indígenas receberão pontuação adicional de 5 pontos.
O diretor deverá comprovar experiência por meio de currículo e filmografia.`;

const edital = (extra: Record<string, unknown> = {}) =>
  toEdital({
    id: "e1",
    title: "Chamada fictícia",
    status: "open",
    deadline: "2026-12-15",
    max_amount_per_project: 1_000_000,
    min_budget: 500_000,
    max_budget: 3_000_000,
    required_documents: ["Certidão negativa de débitos federais"],
    eligibility_status: "eligible",
    ...extra,
  });

let seq = 0;
const item = (extra: Partial<WorkspaceItem>): WorkspaceItem => ({
  id: `i${++seq}`,
  category: "document",
  title: "Item",
  description: null,
  requirement: "mandatory",
  origin: "edital",
  sourceKey: null,
  evidence: null,
  status: "pending",
  responsibleId: null,
  dueDate: null,
  charLimit: null,
  wordLimit: null,
  pageLimit: null,
  content: null,
  orgDocumentId: null,
  notes: null,
  position: 0,
  updatedAt: null,
  ...extra,
});

const NOW = new Date("2026-11-01T12:00:00-03:00");

const baseInput = (extra: Partial<AssessInput> = {}): AssessInput => ({
  edital: edital(),
  workspace: {
    projetoId: "p1",
    status: "preparing",
    requestedAmount: 800_000,
    totalBudget: 1_500_000,
    counterpartAmount: 200_000,
    rules: extractWorkspaceRules(EDITAL_TEXT),
    rulesExtractedAt: "2026-10-20T10:00:00Z",
  },
  items: [],
  production: {
    id: "p1",
    title: "Doc",
    format: "feature_film",
    genre: "documentary",
    stage: "development",
    budget: 1_500_000,
  },
  match: null,
  documents: [],
  pendingChanges: 0,
  latestEditalDocumentAt: "2026-10-01T10:00:00Z",
  now: NOW,
  ...extra,
});

describe("extractWorkspaceRules", () => {
  const rules = extractWorkspaceRules(EDITAL_TEXT);

  it("identifica textos com limite e a unidade (caracteres, páginas, palavras)", () => {
    const byKey = Object.fromEntries(rules.textLimits.map((limit) => [limit.key, limit]));
    expect(byKey.sinopse?.charLimit).toBe(1500);
    expect(byKey.argumento?.pageLimit).toBe(5);
    expect(byKey.justificativa?.wordLimit).toBe(300);
    expect(byKey.sinopse?.evidence.snippet).toContain("1.500 caracteres");
  });

  it("textos exigidos sem limite também viram itens", () => {
    const keys = rules.texts.map((text) => text.key);
    expect(keys).toEqual(expect.arrayContaining(["plano-distribuicao", "acessibilidade"]));
  });

  it("critérios de avaliação com pontuação, bônus, direitos, equipe e orçamento", () => {
    expect(rules.criteria.map((criterion) => criterion.points)).toEqual(
      expect.arrayContaining([30, 25, 20]),
    );
    expect(rules.bonus.some((rule) => rule.text.includes("pontuação adicional"))).toBe(true);
    expect(rules.rights.some((rule) => rule.text.includes("cessão de direitos"))).toBe(true);
    expect(rules.team.some((rule) => rule.text.includes("filmografia"))).toBe(true);
    expect(rules.counterpartMinPercent?.value).toBe(10);
    expect(rules.adminMaxPercent?.value).toBe(15);
    expect(rules.documents.length).toBeGreaterThanOrEqual(3);
  });

  it("texto vazio não inventa regras", () => {
    expect(extractWorkspaceRules("   ")).toEqual(EMPTY_RULES);
  });

  it("leitura defensiva do jsonb gravado", () => {
    expect(parseWorkspaceRules(null)).toEqual(EMPTY_RULES);
    expect(parseWorkspaceRules({ textLimits: "x" }).textLimits).toEqual([]);
    expect(parseWorkspaceRules(JSON.parse(JSON.stringify(rules))).criteria.length).toBe(
      rules.criteria.length,
    );
  });
});

describe("buildChecklistSeeds", () => {
  const rules = extractWorkspaceRules(EDITAL_TEXT);
  const seeds = buildChecklistSeeds(edital(), rules);

  it("gera itens por categoria com limites e trecho", () => {
    const sinopse = seeds.find((seed) => seed.sourceKey === "text:sinopse");
    expect(sinopse).toMatchObject({ category: "text", charLimit: 1500, requirement: "mandatory" });
    expect(seeds.some((seed) => seed.category === "rights")).toBe(true);
    expect(seeds.some((seed) => seed.category === "team")).toBe(true);
    expect(seeds.some((seed) => seed.requirement === "bonus")).toBe(true);
    expect(seeds.some((seed) => seed.sourceKey === "budget:values")).toBe(true);
    expect(seeds.some((seed) => seed.sourceKey === "criteria:review")).toBe(true);
  });

  it("documento do cadastro e do regulamento iguais não duplicam", () => {
    const certidoes = seeds.filter((seed) => /certidão negativa/i.test(seed.title));
    expect(certidoes).toHaveLength(1);
  });

  it("chaves estáveis: regerar só acrescenta o que é novo", () => {
    const again = buildChecklistSeeds(edital(), rules);
    expect(again.map((seed) => seed.sourceKey)).toEqual(seeds.map((seed) => seed.sourceKey));
    expect(
      newSeeds(
        again,
        seeds.map((seed) => seed.sourceKey),
      ),
    ).toHaveLength(0);
  });

  it("elegibilidade não confirmada vira item a confirmar (nunca 'não elegível')", () => {
    const pending = buildChecklistSeeds(edital({ eligibility_status: "not_confirmed" }), rules);
    expect(pending.some((seed) => seed.sourceKey === "eligibility:lep")).toBe(true);
    expect(seeds.some((seed) => seed.sourceKey === "eligibility:lep")).toBe(false);
  });
});

describe("measureText", () => {
  it("conta caracteres com espaços, palavras e estima páginas", () => {
    const metrics = measureText("um dois três", { charLimit: 5, wordLimit: null, pageLimit: null });
    expect(metrics).toMatchObject({ chars: 12, words: 3, estimatedPages: 1, overChars: true });
    expect(measureText(null).words).toBe(0);
    expect(measureText("palavra ".repeat(1001)).estimatedPages).toBe(3);
  });
});

describe("assessWorkspace", () => {
  it("sem itens: não iniciada", () => {
    const result = assessWorkspace(baseInput());
    expect(result.readiness.level).toBe("not_started");
    expect(result.answers[0]?.answer).toContain("gere o checklist");
  });

  it("sem produção vinculada: bloqueada e próxima ação é vincular", () => {
    const result = assessWorkspace(
      baseInput({
        workspace: { ...baseInput().workspace, projetoId: null },
        items: [item({ status: "done", orgDocumentId: null, notes: "na pasta" })],
      }),
    );
    expect(result.readiness.level).toBe("blocked");
    expect(result.nextActions[0]?.title).toContain("Nenhuma produção vinculada");
  });

  it("restrição territorial é impedimento a confirmar pela equipe", () => {
    const result = assessWorkspace(
      baseInput({
        edital: edital({
          eligibility_status: "territorial_restriction",
          eligibility_reason: "Exclusivo RJ",
        }),
      }),
    );
    const finding = result.findings.find((entry) => entry.key === "eligibility");
    expect(finding?.severity).toBe("blocker");
    expect(finding?.detail).toContain("decisão da equipe");
  });

  it("texto acima do limite é erro e aparece nas respostas", () => {
    const sinopse = item({
      category: "text",
      title: "Sinopse",
      charLimit: 10,
      content: "texto longo demais",
    });
    const result = assessWorkspace(baseInput({ items: [sinopse] }));
    expect(result.findings.some((entry) => entry.key === `text-over:${sinopse.id}`)).toBe(true);
    expect(result.textMetrics[sinopse.id]?.overChars).toBe(true);
    const answer = result.answers.find((entry) => entry.question.startsWith("Algum texto"));
    expect(answer?.tone).toBe("bad");
  });

  it("orçamento: teto, faixa, solicitado × total e contrapartida", () => {
    const ok = assessWorkspace(baseInput());
    expect(ok.budgetChecks.filter((check) => check.state === "fail")).toHaveLength(0);
    expect(ok.budgetChecks.find((check) => check.key === "counterpart")?.state).toBe("ok");

    const bad = assessWorkspace(
      baseInput({
        workspace: {
          ...baseInput().workspace,
          requestedAmount: 1_200_000,
          totalBudget: 400_000,
          counterpartAmount: 10_000,
        },
      }),
    );
    const failed = bad.budgetChecks
      .filter((check) => check.state === "fail")
      .map((check) => check.key);
    expect(failed).toEqual(
      expect.arrayContaining(["cap", "range", "requested-total", "counterpart"]),
    );
    expect(bad.answers.find((entry) => entry.question.includes("teto"))?.tone).toBe("bad");
  });

  it("documento do acervo vencido ou vencendo antes do prazo", () => {
    const docs: OrgDocument[] = [
      {
        id: "d1",
        scope: "company",
        projetoId: null,
        category: "fiscal",
        title: "CND",
        filePath: null,
        fileName: null,
        externalUrl: null,
        validUntil: "2026-10-01",
        notes: null,
      },
      {
        id: "d2",
        scope: "company",
        projetoId: null,
        category: "fiscal",
        title: "FGTS",
        filePath: null,
        fileName: null,
        externalUrl: null,
        validUntil: "2026-12-01",
        notes: null,
      },
    ];
    const result = assessWorkspace(
      baseInput({
        documents: docs,
        items: [
          item({ orgDocumentId: "d1", status: "done" }),
          item({ orgDocumentId: "d2", status: "done" }),
        ],
      }),
    );
    expect(result.findings.some((entry) => entry.key.startsWith("doc-expired:"))).toBe(true);
    expect(result.findings.some((entry) => entry.key.startsWith("doc-expiring:"))).toBe(true);
    expect(result.expiredDocuments.map((doc) => doc.id)).toEqual(["d1"]);
  });

  it("prontidão: 100% dos obrigatórios sem erros = pronta; N/A não conta", () => {
    const result = assessWorkspace(
      baseInput({
        items: [
          item({ status: "done", notes: "enviado" }),
          item({ status: "not_applicable" }),
          item({ requirement: "bonus", status: "pending", title: "Cotas" }),
        ],
      }),
    );
    expect(result.readiness).toMatchObject({ level: "ready", percent: 100, mandatoryTotal: 1 });
    expect(result.bonusPending).toHaveLength(1);
  });

  it("próximas ações priorizam correções e depois obrigatórios por prazo interno", () => {
    const late = item({ title: "Contrato social", dueDate: "2026-11-20" });
    const early = item({ title: "CND", dueDate: "2026-11-05" });
    const result = assessWorkspace(
      baseInput({
        workspace: { ...baseInput().workspace, requestedAmount: 2_000_000 },
        items: [late, early],
      }),
    );
    expect(result.nextActions[0]?.title).toContain("Corrigir: Orçamento");
    const itemActions = result.nextActions.filter((action) => action.key.startsWith("item:"));
    expect(itemActions.map((action) => action.itemId)).toEqual([early.id, late.id]);
    expect(result.readiness.level).toBe("in_progress");
  });

  it("regras desatualizadas e retificações pendentes geram alerta", () => {
    const result = assessWorkspace(
      baseInput({ pendingChanges: 2, latestEditalDocumentAt: "2026-10-25T00:00:00Z" }),
    );
    const keys = result.findings.map((entry) => entry.key);
    expect(keys).toEqual(expect.arrayContaining(["changes", "rules-stale"]));
  });

  it("produção incompatível no Match vira erro explicado", () => {
    const match = {
      projectId: "p1",
      projectTitle: "Doc",
      verdict: "incompatible",
      met: [],
      attention: [],
      unmet: [{ criterion: "Formato", detail: "Edital aceita só séries" }],
      score: 20,
      confidence: 1,
      level: "low",
      factors: [],
      blockers: [],
    } satisfies MatchResult;
    const result = assessWorkspace(baseInput({ match }));
    expect(result.findings.find((entry) => entry.key === "match-unmet:Formato")?.severity).toBe(
      "error",
    );
  });

  it("encerrado é impedimento", () => {
    const result = assessWorkspace(baseInput({ edital: edital({ deadline: "2026-10-01" }) }));
    expect(result.findings.find((entry) => entry.key === "closed")?.severity).toBe("blocker");
  });
});

describe("buildChecklistSeeds — classificação sem duplicar", () => {
  it("cláusula de cessão e de orçamento não aparecem também como documento", () => {
    const seeds = buildChecklistSeeds(edital(), extractWorkspaceRules(EDITAL_TEXT));
    const cessao = seeds.filter((seed) => /termo de cessão/i.test(seed.title));
    expect(cessao.map((seed) => seed.category)).toEqual(["rights"]);
    const planilha = seeds.filter((seed) => /planilha orçamentária/i.test(seed.title));
    expect(planilha.map((seed) => seed.category)).toEqual(["budget"]);
  });
});
