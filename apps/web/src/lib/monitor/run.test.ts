import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makePdf } from "@lep/ingestion/testing";
import { startFakeSupabase, type FakeDb } from "@/test/fake-supabase";

const ORG = "10000000-0000-4000-8000-00000000000a";

// "Site de editais" fictício (listagem + páginas de detalhe + robots.txt).
function startFakeSite() {
  const pages: Record<string, { type: string; body: string | Buffer }> = {
    "/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /privado/\n" },
    "/editais/": {
      type: "text/html; charset=utf-8",
      body: `<html><body><nav><a href="/">Início</a></nav>
        <a href="/editais/edital-producao-longa/">Edital de Produção de Longas-Metragens 2026</a>
        <a href="/editais/edital-producao-longa/">Saiba mais</a>
        <a href="/editais/chamada-curtas-rj/">Chamada de Curtas-Metragens para produtoras cariocas</a>
        <a href="/editais/resultado-edital-5/">Resultado final do Edital nº 5</a>
        <a href="/privado/edital-interno/">Edital interno de seleção</a>
        <a href="/fora/">Página fora do ar sobre edital de cinema</a>
        <a href="/editais/programa-de-integridade/">Programa de Integridade dos editais</a>
        <a href="/acervo/edital-antigo-cinema/">Edital antigo de cinema (acervo)</a>
      </body></html>`,
    },
    "/editais/edital-producao-longa/": {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Edital de Produção | Site</title>
        <meta name="description" content="Edital fictício de apoio à produção de longas-metragens de ficção e documentário."></head>
        <body><h1>Edital de Produção de Longas-Metragens 2026</h1>
        <p>Edital nº 5/2026.</p>
        <p>O edital tem valor total de R$ 10.000.000,00 para até 5 projetos.</p>
        <p>Inscrições de 01/10/2026 a 30/11/2026, exclusivamente pela internet.</p>
        <p>Podem participar produtoras independentes de todo o território nacional.</p>
        <a href="/arquivos/resultado-anterior.pdf">Resultado do edital anterior</a>
        <a href="/arquivos/edital-longas-2026.pdf">Edital completo (PDF)</a></body></html>`,
    },
    // Regulamento fictício (PDF gerado no teste; sem arquivos reais).
    "/arquivos/edital-longas-2026.pdf": {
      type: "application/pdf",
      body: makePdf([
        ["EDITAL FICTICIO DE PRODUCAO DE LONGAS-METRAGENS 2026"],
        [
          "Art. 3o Valor total de R$ 10.000.000,00, com até R$ 2.000.000,00 por projeto.",
          "Art. 4o Serão selecionados até 5 projetos de produção de longas-metragens.",
          "Art. 5o As inscrições encerram-se em 30/11/2026.",
        ],
      ]),
    },
    // Agregador fictício que republica o mesmo edital nº 5/2026 (etapa 8).
    "/agregador/": {
      type: "text/html; charset=utf-8",
      body: `<html><body>
        <a href="/agregador/oportunidade-5-2026/">Instituição Fictícia - Edital 5/2026 - Produção de Longas-Metragens</a>
      </body></html>`,
    },
    "/agregador/oportunidade-5-2026/": {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Oportunidade | Agregador</title></head><body>
        <h1>Edital nº 5/2026 — Produção de Longas-Metragens</h1>
        <p>Inscrições até 30/11/2026. Podem participar produtoras de todo o território nacional.</p>
        <p>Leia o regulamento completo no site da instituição.</p></body></html>`,
    },
    "/editais/programa-de-integridade/": {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Programa de Integridade</title></head><body>
        <h1>Programa de Integridade</h1><p>Código de conduta, canal de denúncias e políticas internas da instituição fictícia.</p></body></html>`,
    },
    "/editais/chamada-curtas-rj/": {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Chamada de Curtas</title></head><body>
        <h1>Chamada de Curtas-Metragens</h1>
        <p>Somente empresas produtoras sediadas no Município do Rio de Janeiro há pelo menos 2 anos.</p>
        <p>Inscrições até 15/12/2026.</p></body></html>`,
    },
  };
  const server: Server = createServer((req, res) => {
    const page = pages[req.url ?? ""];
    if (!page) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": page.type });
    res.end(page.body);
  });
  return new Promise<{ url: string; server: Server; pages: typeof pages }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, pages }),
    ),
  );
}

let site: Awaited<ReturnType<typeof startFakeSite>>;
let supabase: Awaited<ReturnType<typeof startFakeSupabase>>;
const db: FakeDb = {
  editais: [],
  edital_documents: [],
  edital_sources: [],
  monitor_runs: [],
  monitor_ignored_urls: [],
  edital_sightings: [],
  edital_matches: [],
  edital_changes: [],
  // Projeto fictício da organização (Match v2 gravado na importação).
  projetos: [
    {
      id: "projeto-1",
      org_id: ORG,
      title: "Projeto Fictício",
      format: "feature_film",
      genre: "fiction",
      stage: "production",
      budget: 3000000,
    },
  ],
};

beforeAll(async () => {
  process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK = "1"; // só vale com NODE_ENV=test
  site = await startFakeSite();
  supabase = await startFakeSupabase(db);
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabase.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake";
  process.env.SUPABASE_SECRET_KEY = "fake-secret";
  db.edital_sources!.push(
    {
      id: "fonte-1",
      org_id: ORG,
      name: "Fonte Fictícia",
      agency: "Instituição Fictícia",
      list_url: `${site.url}/editais/`,
      audiovisual_only: true,
      link_contains: null,
      active: true,
      // Adaptador da fonte (etapa 6): exclusão por endereço, sem seletores CSS.
      adapter_config: { linkExcludes: ["/acervo/"] },
    },
    {
      id: "fonte-2",
      org_id: ORG,
      name: "Fonte fora do ar",
      agency: null,
      list_url: `${site.url}/nao-existe/`,
      audiovisual_only: true,
      link_contains: null,
      active: true,
    },
    {
      id: "fonte-3",
      org_id: ORG,
      name: "Agregador Fictício",
      agency: null,
      list_url: `${site.url}/agregador/`,
      audiovisual_only: true,
      link_contains: null,
      active: true,
    },
  );
});

afterAll(async () => {
  delete process.env.LEP_TEST_ALLOW_PRIVATE_NETWORK;
  site.server.close();
  await supabase.close();
});

describe("runMonitor (varredura)", () => {
  it("importa editais novos como revisão pendente, com prazo e valor sugeridos", async () => {
    const { runMonitor } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const results = await runMonitor(createAdminClient(), {
      trigger: "cron",
      now: new Date("2026-09-26T12:00:00-03:00"),
    });

    const ok = results.find((result) => result.sourceId === "fonte-1");
    expect(ok).toMatchObject({
      status: "ok",
      imported: 2,
      rejected: 1,
      pendingReview: 2,
      ignored: 1,
    });
    expect(ok!.warning).toBeUndefined();

    expect(db.editais).toHaveLength(2);
    expect(db.editais!.find((e) => String(e.official_url).includes("longa"))).toMatchObject({
      title: "Edital de Produção de Longas-Metragens 2026",
      official_url: `${site.url}/editais/edital-producao-longa/`,
      review_status: "pending",
      origin: "monitor",
      source_id: "fonte-1",
      agency: "Instituição Fictícia",
      deadline: "2026-11-30T23:59:00-03:00",
      // Inscrições abrem em 01/10 e "hoje" é 26/09: em breve (etapa 7).
      status: "upcoming",
      total_amount: 10000000,
      summary: "Edital fictício de apoio à produção de longas-metragens de ficção e documentário.",
      eligible_territories: ["BR"],
    });
    // Cópia da página guardada no armazenamento, na pasta da organização.
    expect([...supabase.files.keys()].every((path) => path.startsWith(`${ORG}/captures/`))).toBe(
      true,
    );
    // 2 páginas + o regulamento em PDF da primeira.
    expect(supabase.files.size).toBe(3);
  });

  it("extração ampliada (etapa 7): regulamento em PDF lido, guardado como anexo, com evidência por campo", () => {
    const edital = db.editais!.find((e) => String(e.official_url).includes("longa"))!;
    expect(edital).toMatchObject({
      max_amount_per_project: 2000000,
      accepted_formats: ["feature_film"],
      extraction_notes: [],
    });
    const evidence = edital.field_evidence as Record<
      string,
      { value: unknown; source: string; snippet: string }
    >;
    expect(evidence.deadline).toMatchObject({
      value: "2026-11-30",
      source: "pdf",
      label: "Regulamento (PDF)",
    });
    expect(evidence.deadline!.snippet).toContain("encerram-se em 30/11/2026");
    expect(evidence.maxAmountPerProject).toMatchObject({ value: 2000000, source: "pdf" });
    expect(evidence.projectCount).toMatchObject({ value: 5, source: "pdf" });
    expect(evidence.opensAt).toMatchObject({ value: "2026-10-01", source: "page" });
    expect(edital.extracted_at).toBeTruthy();
    // O regulamento é o PDF certo (não o resultado anterior) e fica como anexo do edital.
    const annex = db.edital_documents!.find((doc) => String(doc.source_url).endsWith(".pdf"));
    expect(annex).toMatchObject({
      edital_id: edital.id,
      kind: "annex",
      mime_type: "application/pdf",
    });
    expect(String(annex!.source_url)).toContain("edital-longas-2026.pdf");
    expect((annex!.metadata as { role: string }).role).toBe("regulation");
  });

  it("deduplicação multi-fonte (etapa 8): mesmo edital no agregador vira avistamento, não edital novo", () => {
    expect(db.editais).toHaveLength(2);
    const longa = db.editais!.find((e) => String(e.official_url).includes("longa"))!;
    expect(longa.canonical_key).toBe("n:5/2026");
    expect(db.edital_sightings!.filter((item) => item.edital_id === longa.id)).toEqual([
      expect.objectContaining({
        source_id: "fonte-1",
        match_reason: "Primeira fonte onde o edital foi encontrado",
      }),
      expect.objectContaining({
        source_id: "fonte-3",
        url: `${site.url}/agregador/oportunidade-5-2026/`,
        match_reason: expect.stringContaining("mesmo número (5/2026)"),
      }),
    ]);
    expect(db.monitor_runs!.find((run) => run.source_id === "fonte-3")).toMatchObject({
      imported: 0,
      duplicates: 1,
    });
  });

  it("Match v2 (etapa 9): gravado para cada edital importado × projeto, com fatores e hash", () => {
    const longa = db.editais!.find((e) => String(e.official_url).includes("longa"))!;
    const rj = db.editais!.find((e) => String(e.official_url).includes("curtas-rj"))!;
    const rows = db.edital_matches!;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.edital_id === longa.id)).toMatchObject({
      org_id: ORG,
      projeto_id: "projeto-1",
      version: "v2",
      verdict: expect.any(String),
      inputs_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const restricted = rows.find((row) => row.edital_id === rj.id)!;
    expect(restricted.level).toBe("low");
    expect(String((restricted.blockers as string[])[0])).toContain("Território");
    expect(Array.isArray(restricted.factors)).toBe(true);
  });

  it("diretriz territorial: exclusivo de outro município fica visível como restrição territorial, com motivo e evidência (não é descartado)", () => {
    const restricted = db.editais!.find((e) => String(e.official_url).includes("curtas-rj"));
    expect(restricted).toMatchObject({
      review_status: "pending",
      origin: "monitor",
      eligible_territories: ["RJ:Rio de Janeiro"],
      eligibility_status: "territorial_restriction",
      eligibility_source: "auto",
    });
    expect(restricted!.triage_reason).toBeUndefined();
    expect(String(restricted!.eligibility_reason)).toContain(
      "a LEP Filmes é sediada em São Paulo/SP",
    );
    expect(String(restricted!.eligibility_evidence)).toContain(
      "sediadas no municipio do rio de janeiro",
    );
    expect(
      db.editais!.find((e) => String(e.official_url).includes("longa"))!.eligibility_status,
    ).toBe("eligible");
    expect(db.monitor_runs!.find((run) => run.source_id === "fonte-1")).toMatchObject({
      imported: 2,
      rejected: 1,
      pending_review: 2,
      duplicates: 0,
      blocked_by_robots: 1,
    });
    expect(db.monitor_runs!.find((run) => run.source_id === "fonte-1")!.execution_id).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("ignora ruído (resultado) e páginas proibidas pelo robots.txt", () => {
    const urls = db.editais!.map((edital) => edital.official_url);
    expect(urls.some((url) => String(url).includes("resultado"))).toBe(false);
    expect(urls.some((url) => String(url).includes("/privado/"))).toBe(false);
  });

  it("classificador (etapa 6): página institucional não vira edital; fica registrada com o motivo", () => {
    const urls = db.editais!.map((edital) => String(edital.official_url));
    expect(urls.some((url) => url.includes("integridade"))).toBe(false);
    expect(db.monitor_ignored_urls).toHaveLength(1);
    expect(db.monitor_ignored_urls![0]).toMatchObject({
      org_id: ORG,
      source_id: "fonte-1",
      page_type: "institutional",
    });
    expect(String((db.monitor_ignored_urls![0]!.reasons as string[])[0])).toContain("integridade");
    // Nada guardado no Storage para a página ignorada (2 importadas + 1 regulamento).
    expect(supabase.files.size).toBe(3);
    expect(db.monitor_runs!.find((run) => run.source_id === "fonte-1")).toMatchObject({
      ignored_pages: 1,
    });
  });

  it("adaptador da fonte: link excluído por endereço nem é considerado", () => {
    expect(db.editais!.some((edital) => String(edital.official_url).includes("/acervo/"))).toBe(
      false,
    );
    expect(db.monitor_ignored_urls!.some((item) => String(item.url).includes("/acervo/"))).toBe(
      false,
    );
  });

  it("edital importado registra o tipo de página e os sinais", () => {
    expect(db.editais!.find((e) => String(e.official_url).includes("longa"))).toMatchObject({
      page_type: "opportunity",
      opportunity_kind: "edital",
    });
    expect(
      db.editais!.find((e) => String(e.official_url).includes("longa"))!.page_type_reasons,
    ).toEqual(expect.arrayContaining(["período de inscrição", "valor em R$"]));
  });

  it("fonte com problema é registrada como erro, sem interromper as demais", () => {
    const failed = db.monitor_runs!.find((run) => run.source_id === "fonte-2");
    expect(failed).toMatchObject({ status: "error", trigger: "cron" });
    expect(db.edital_sources!.find((source) => source.id === "fonte-2")).toMatchObject({
      last_status: "error",
    });
    expect(db.edital_sources!.find((source) => source.id === "fonte-1")).toMatchObject({
      last_status: "ok",
      last_imported: 2,
    });
  });

  it("não reimporta o que já é conhecido na execução seguinte", async () => {
    const { runMonitor } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const results = await runMonitor(createAdminClient(), { trigger: "manual" });
    expect(results.find((result) => result.sourceId === "fonte-1")).toMatchObject({
      status: "ok",
      imported: 0,
      rejected: 0,
      duplicates: 2,
      pendingReview: 0,
    });
    // Página ignorada não é baixada de novo.
    expect(results.find((result) => result.sourceId === "fonte-1")!.ignored).toBe(0);
    expect(db.monitor_ignored_urls).toHaveLength(1);
    // O restrito também não volta duplicado: o link continua conhecido.
    expect(db.editais).toHaveLength(2);
    expect(db.monitor_runs!.filter((run) => run.source_id === "fonte-1")).toHaveLength(2);
  });

  it("alterações (etapa 10): retificação prorroga o prazo → alteração pendente, edital NÃO é sobrescrito", async () => {
    const longa = db.editais!.find((e) => String(e.official_url).includes("longa"))!;
    const deadlineBefore = longa.deadline;
    // O órgão publica uma retificação e atualiza a página.
    site.pages["/editais/edital-producao-longa/"] = {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Edital de Produção | Site</title></head><body>
        <h1>Edital de Produção de Longas-Metragens 2026</h1><p>Edital nº 5/2026.</p>
        <p>O edital tem valor total de R$ 10.000.000,00 para até 5 projetos.</p>
        <p>Inscrições prorrogadas: de 01/10/2026 a 15/12/2026.</p>
        <p>Podem participar produtoras independentes de todo o território nacional.</p>
        <a href="/arquivos/retificacao-1.pdf">Retificação nº 1</a></body></html>`,
    };
    site.pages["/arquivos/retificacao-1.pdf"] = {
      type: "application/pdf",
      body: makePdf([
        ["RETIFICACAO No 1 - EDITAL 5/2026", "As inscrições encerram-se em 15/12/2026."],
      ]),
    };
    const { runMonitor } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const results = await runMonitor(createAdminClient(), {
      trigger: "cron",
      now: new Date("2026-10-05T12:00:00-03:00"),
    });
    expect(results.find((result) => result.sourceId === "fonte-1")).toMatchObject({ updated: 1 });

    const change = db.edital_changes!.find((item) => item.edital_id === longa.id)!;
    expect(change).toMatchObject({ kind: "rectification", org_id: ORG });
    expect(String(change.summary)).toContain("retificação");
    expect(change.changes).toEqual([
      expect.objectContaining({ field: "deadline", before: "2026-11-30", after: "2026-12-15" }),
    ]);
    // Nada sobrescrito: a equipe decide.
    expect(longa.deadline).toBe(deadlineBefore);
    const rectification = db.edital_documents!.find((doc) =>
      String(doc.source_url).includes("retificacao-1.pdf"),
    );
    expect(rectification).toMatchObject({ edital_id: longa.id, kind: "rectification" });
    expect((change.document_ids as string[]).length).toBeGreaterThanOrEqual(1);
  });

  it("alterações: sem mudança no texto → nada registrado na verificação seguinte", async () => {
    const { runMonitor } = await import("./run");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const before = db.edital_changes!.length;
    await runMonitor(createAdminClient(), {
      trigger: "cron",
      now: new Date("2026-10-07T12:00:00-03:00"),
    });
    expect(db.edital_changes!.length).toBe(before);
  });
});
