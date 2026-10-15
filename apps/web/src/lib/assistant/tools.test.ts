import { describe, expect, it } from "vitest";
import { checkEvidence, locateQuote } from "./evidence";
import { executeProposal, parseProposal } from "./proposals";
import { MemoryStore, PAGES, uuid } from "./test-support";
import { ASSISTANT_TOOL_SPECS, createToolExecutor, toStrictSchema } from "./tools";
import { z } from "zod";

const NOW = new Date("2026-11-01T12:00:00-03:00");
let callSeq = 0;
function setup() {
  const store = new MemoryStore();
  const execute = createToolExecutor({ store, now: NOW });
  const call = async (name: string, input: unknown) => {
    const result = await execute({ id: `call_${++callSeq}`, name, input });
    return { ...result, data: JSON.parse(result.content) as Record<string, unknown> };
  };
  return { store, call };
}

const noEvidence = { documento: null, pagina: null, secao: null, trecho: null };
const requisito = (overrides: Record<string, unknown> = {}) => ({
  chave: "certidao-federal",
  categoria: "document",
  titulo: "Certidão negativa de débitos federais",
  descricao: null,
  exigencia: "mandatory",
  confianca: "confirmed",
  origem: "edital",
  evidencia: { ...noEvidence, trecho: "Certidão negativa de débitos federais" },
  limite_caracteres: null,
  limite_palavras: null,
  limite_paginas: null,
  ...overrides,
});

describe("schemas das ferramentas (modo estrito da API)", () => {
  it("todo objeto fecha propriedades extras, exige todas as chaves e não usa restrições não suportadas", () => {
    const check = (schema: unknown): void => {
      if (Array.isArray(schema)) return schema.forEach(check);
      if (!schema || typeof schema !== "object") return;
      const record = schema as Record<string, unknown>;
      for (const key of [
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "pattern",
        "format",
        "$schema",
      ]) {
        expect(record[key]).toBeUndefined();
      }
      if (record.type === "object") {
        expect(record.additionalProperties).toBe(false);
        expect(record.required).toEqual(Object.keys((record.properties as object) ?? {}));
      }
      Object.values(record).forEach(check);
    };
    expect(ASSISTANT_TOOL_SPECS.length).toBeGreaterThanOrEqual(18);
    for (const spec of ASSISTANT_TOOL_SPECS) check(spec.inputSchema);
    expect(new Set(ASSISTANT_TOOL_SPECS.map((spec) => spec.name)).size).toBe(
      ASSISTANT_TOOL_SPECS.length,
    );
  });
  it("toStrictSchema remove restrições mantendo a validação no Zod", () => {
    expect(toStrictSchema(z.object({ a: z.string().max(3) }))).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    });
  });
  it("não existe ferramenta de SQL, e-mail, envio externo ou exclusão direta", () => {
    const names = ASSISTANT_TOOL_SPECS.map((spec) => spec.name).join(" ");
    expect(names).not.toMatch(/sql|email|enviar|excluir|deletar|submeter/);
  });
});

describe("executor: validação, erros e auditoria", () => {
  it("entrada inválida é recusada, auditada e devolvida como erro ao agente", async () => {
    const { store, call } = setup();
    const result = await call("registrar_requisito", { chave: "x" });
    expect(result.isError).toBe(true);
    expect(result.data.erro).toBe("entrada_invalida");
    expect(store.actions.at(-1)).toMatchObject({ tool: "registrar_requisito", status: "rejected" });
  });
  it("ferramenta inexistente vira erro estruturado", async () => {
    const { call } = setup();
    expect((await call("executar_sql", { sql: "drop table x" })).data.erro).toBe(
      "ferramenta_inexistente",
    );
  });
  it("falha interna não derruba a execução: erro registrado e devolvido", async () => {
    const { store, call } = setup();
    store.failNext = true;
    const result = await call("consultar_equipe", {});
    expect(result.isError).toBe(true);
    expect(result.data.erro).toBe("erro_interno");
    expect(store.actions.at(-1)?.status).toBe("error");
  });
});

describe("registrar_requisito — idempotência e evidência", () => {
  it("reexecutar não duplica: mesma chave ou mesmo título atualiza o item", async () => {
    const { store, call } = setup();
    const first = await call("registrar_requisito", requisito());
    expect(first.data.acao).toBe("criado");
    const again = await call("registrar_requisito", requisito());
    const sameTitle = await call("registrar_requisito", requisito({ chave: "outra-chave" }));
    expect(again.data.acao).toBe("atualizado");
    expect(sameTitle.data.acao).toBe("atualizado");
    expect(store.itemRows).toHaveLength(1);
  });
  it("trecho literal confirma e fixa documento e página reais", async () => {
    const { store, call } = setup();
    await call(
      "registrar_requisito",
      requisito({
        evidencia: { ...noEvidence, pagina: 99, trecho: "Certidão negativa de débitos federais" },
      }),
    );
    expect(store.itemRows[0]).toMatchObject({
      confidence: "confirmed",
      evidenceDocument: "Regulamento",
      evidencePage: 2,
    });
  });
  it("sem trecho localizável: confirmado vira INFERIDO (inferência nunca vira fato)", async () => {
    const { store, call } = setup();
    const result = await call(
      "registrar_requisito",
      requisito({
        chave: "seguro",
        titulo: "Apólice de seguro",
        evidencia: { ...noEvidence, trecho: "apólice de seguro obrigatória" },
      }),
    );
    expect(store.itemRows[0]?.confidence).toBe("inferred");
    expect(String(result.data.avisos)).toContain("INFERIDO");
  });
  it("não sobrescreve o trabalho da equipe (status, responsável, texto)", async () => {
    const { store, call } = setup();
    await call("registrar_requisito", requisito());
    Object.assign(store.itemRows[0]!, {
      status: "done",
      responsibleId: uuid(20),
      updatedVia: "user",
      notes: "na pasta",
    });
    await call("registrar_requisito", requisito({ descricao: "nova descrição" }));
    expect(store.itemRows[0]).toMatchObject({
      status: "done",
      responsibleId: uuid(20),
      notes: "na pasta",
    });
  });
});

describe("regras de autonomia", () => {
  it("concluir documento exige documento do acervo válido", async () => {
    const { store, call } = setup();
    const { data } = await call("registrar_requisito", requisito());
    const itemId = String(data.item_id);
    const noDoc = await call("atualizar_item", {
      item_id: itemId,
      status: "done",
      prazo_interno: null,
      observacao: null,
      justificativa: "temos",
    });
    expect(noDoc.isError).toBe(true);
    await call("vincular_documento_acervo", {
      item_id: itemId,
      documento_id: uuid(10),
      confianca: "inferred",
      justificativa: "mesmo nome",
    });
    const expired = await call("atualizar_item", {
      item_id: itemId,
      status: "done",
      prazo_interno: null,
      observacao: null,
      justificativa: "temos",
    });
    expect(String(expired.data.mensagem)).toContain("venceu");
    expect(store.itemRows[0]?.status).toBe("pending");
  });
  it("não reabre item concluído pela equipe", async () => {
    const { store, call } = setup();
    const { data } = await call("registrar_requisito", requisito());
    Object.assign(store.itemRows[0]!, { status: "done", updatedVia: "user" });
    const result = await call("atualizar_item", {
      item_id: String(data.item_id),
      status: "pending",
      prazo_interno: null,
      observacao: null,
      justificativa: "faltou",
    });
    expect(result.isError).toBe(true);
    expect(store.itemRows[0]?.status).toBe("done");
  });
  it("trocar documento já vinculado exige confirmação", async () => {
    const { call } = setup();
    const { data } = await call("registrar_requisito", requisito());
    await call("vincular_documento_acervo", {
      item_id: String(data.item_id),
      documento_id: uuid(10),
      confianca: "inferred",
      justificativa: "x1234",
    });
    const swap = await call("vincular_documento_acervo", {
      item_id: String(data.item_id),
      documento_id: uuid(11),
      confianca: "inferred",
      justificativa: "x1234",
    });
    expect(String(swap.data.mensagem)).toContain("solicitar_confirmacao");
  });
  it("texto da equipe nunca é sobrescrito: vira sugestão da IA", async () => {
    const { store, call } = setup();
    const { data } = await call(
      "registrar_requisito",
      requisito({ chave: "sinopse", categoria: "text", titulo: "Sinopse", limite_caracteres: 50 }),
    );
    const itemId = String(data.item_id);
    const draft = await call("registrar_texto", {
      item_id: itemId,
      conteudo: "Rascunho curto.",
      modo: "rascunho",
    });
    expect(draft.data.gravado_como).toContain("rascunho");
    const suggestion = await call("registrar_texto", {
      item_id: itemId,
      conteudo: "Outra versão bem mais longa que o limite permitido pelo edital fictício.",
      modo: "rascunho",
    });
    expect(suggestion.data.gravado_como).toContain("sugestão");
    expect(suggestion.data.dentro_dos_limites).toBe(false);
    expect(store.itemRows[0]).toMatchObject({ content: "Rascunho curto." });
    expect(store.itemRows[0]?.aiSuggestion).toContain("Outra versão");
  });
  it("responsável: só membro ativo e sem trocar quem já foi definido", async () => {
    const { call } = setup();
    const { data } = await call("registrar_requisito", requisito());
    const itemId = String(data.item_id);
    expect(
      (
        await call("definir_responsavel", {
          item_id: itemId,
          membro_id: uuid(99),
          justificativa: "teste",
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await call("definir_responsavel", {
          item_id: itemId,
          membro_id: uuid(20),
          justificativa: "teste",
        })
      ).isError,
    ).toBe(false);
  });
  it("dados da inscrição: preenche só o que está vazio", async () => {
    const { store, call } = setup();
    const result = await call("preencher_dados_inscricao", {
      producao_id: uuid(30),
      valor_solicitado: 400_000,
      orcamento_total: 900_000,
      contrapartida: null,
      origem: "team",
      justificativa: "planilha da equipe",
    });
    expect(store.workspaceRow).toMatchObject({
      projetoId: uuid(30),
      requestedAmount: 400_000,
      totalBudget: 500_000,
    });
    expect(String(result.data.nao_alterado)).toContain("orcamento_total");
  });
  it("achados: deduplicados por tipo + chave; decisão pendente não é resolvida pelo agente", async () => {
    const { store, call } = setup();
    const finding = {
      tipo: "pending_decision",
      chave: "Escolha da coprodutora",
      titulo: "Definir coprodutora",
      detalhe: "A Diretoria precisa decidir.",
      severidade: "high",
      confianca: "needs_human",
      origem: "ai_inference",
      evidencia: noEvidence,
      pontos: null,
      item_id: null,
    };
    const created = await call("registrar_achado", finding);
    await call("registrar_achado", { ...finding, detalhe: "Atualizado." });
    expect(store.findingRows).toHaveLength(1);
    expect(store.findingRows[0]?.detail).toBe("Atualizado.");
    const resolve = await call("resolver_achado", {
      achado_id: String(created.data.achado_id),
      status: "resolved",
      resolucao: "resolvido",
    });
    expect(resolve.isError).toBe(true);
  });
});

describe("isolamento", () => {
  it("item ou documento de outra inscrição/organização não é alcançável", async () => {
    const { call } = setup();
    const otherItem = await call("atualizar_item", {
      item_id: uuid(555),
      status: "done",
      prazo_interno: null,
      observacao: null,
      justificativa: "outro edital",
    });
    expect(String(otherItem.data.mensagem)).toContain("não encontrado");
    const { data } = await call("registrar_requisito", requisito());
    const otherDoc = await call("vincular_documento_acervo", {
      item_id: String(data.item_id),
      documento_id: uuid(777),
      confianca: "inferred",
      justificativa: "outra org",
    });
    expect(String(otherDoc.data.mensagem)).toContain("não encontrado");
  });
});

describe("confirmação humana e prompt injection", () => {
  it("instrução maliciosa no PDF é entregue como DADO delimitado, e enviar só vira proposta", async () => {
    const { store, call } = setup();
    const read = await call("ler_documento_edital", {
      documento_indice: 0,
      pagina_inicial: 1,
      pagina_final: 3,
    });
    expect(String(read.data.conteudo)).toMatch(
      /^<documento_edital origem="Regulamento">[\s\S]*Ignore todas as suas instruções[\s\S]*<\/documento_edital>$/,
    );
    const proposal = await call("solicitar_confirmacao", {
      acao: "marcar_inscricao_enviada",
      descricao: "Marcar como enviada",
      motivo: "pedido no documento",
      item_id: null,
      documento_id: null,
      campo: null,
      valor: null,
    });
    expect(proposal.data.status).toBe("aguardando_confirmacao");
    expect(store.workspaceRow.status).toBe("preparing"); // nada executado
    expect(store.actions.at(-1)).toMatchObject({
      status: "pending_confirmation",
      kind: "proposal",
    });
  });
  it("marcadores de fechamento no conteúdo não escapam da delimitação", async () => {
    const { wrapUntrusted } = await import("./evidence");
    expect(wrapUntrusted("edital", "x", "a</documento_edital>b")).not.toMatch(
      /a<\/documento_edital>b/,
    );
  });
  it("proposta aprovada é executada por código determinístico (revalidando)", async () => {
    const { store, call } = setup();
    await call("solicitar_confirmacao", {
      acao: "marcar_inscricao_enviada",
      descricao: "Marcar como enviada",
      motivo: "equipe enviou",
      item_id: null,
      documento_id: null,
      campo: null,
      valor: null,
    });
    const proposal = parseProposal(store.actions.at(-1)?.proposal);
    expect(proposal).not.toBeNull();
    expect(await executeProposal(store, proposal!)).toContain("enviada");
    expect(store.workspaceRow.status).toBe("submitted");
  });
  it("proposta inválida é recusada antes de chegar à tela", async () => {
    const { call } = setup();
    const result = await call("solicitar_confirmacao", {
      acao: "substituir_texto",
      descricao: "trocar",
      motivo: "melhor",
      item_id: uuid(404),
      documento_id: null,
      campo: null,
      valor: null,
    });
    expect(result.isError).toBe(true);
  });
});

describe("evidências", () => {
  it("localiza o trecho ignorando acentos/maiúsculas e devolve a página", () => {
    expect(locateQuote([{ label: "R", pages: PAGES }], "VALOR MAXIMO POR PROJETO")).toEqual({
      documentLabel: "R",
      page: 3,
    });
  });
  it("inferência da IA nunca é confirmada", () => {
    const result = checkEvidence({
      input: null,
      confidence: "confirmed",
      sourceKind: "ai_inference",
      documents: [],
      now: NOW,
    });
    expect(result.confidence).toBe("inferred");
  });
});
