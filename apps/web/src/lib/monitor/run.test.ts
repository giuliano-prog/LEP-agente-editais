import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeSupabase, type FakeDb } from "@/test/fake-supabase";

const ORG = "10000000-0000-4000-8000-00000000000a";

// "Site de editais" fictício (listagem + páginas de detalhe + robots.txt).
function startFakeSite() {
  const pages: Record<string, { type: string; body: string }> = {
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
      </body></html>`,
    },
    "/editais/edital-producao-longa/": {
      type: "text/html; charset=utf-8",
      body: `<html><head><title>Edital de Produção | Site</title>
        <meta name="description" content="Edital fictício de apoio à produção de longas-metragens de ficção e documentário."></head>
        <body><h1>Edital de Produção de Longas-Metragens 2026</h1>
        <p>O edital tem valor total de R$ 10.000.000,00 para até 5 projetos.</p>
        <p>Inscrições de 01/10/2026 a 30/11/2026, exclusivamente pela internet.</p>
        <p>Podem participar produtoras independentes de todo o território nacional.</p></body></html>`,
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
  return new Promise<{ url: string; server: Server }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }),
    ),
  );
}

let site: Awaited<ReturnType<typeof startFakeSite>>;
let supabase: Awaited<ReturnType<typeof startFakeSupabase>>;
const db: FakeDb = { editais: [], edital_documents: [], edital_sources: [], monitor_runs: [] };

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
    expect(ok).toMatchObject({ status: "ok", imported: 1, rejected: 1 });

    expect(db.editais).toHaveLength(2);
    expect(db.editais!.find((e) => String(e.official_url).includes("longa"))).toMatchObject({
      title: "Edital de Produção de Longas-Metragens 2026",
      official_url: `${site.url}/editais/edital-producao-longa/`,
      review_status: "pending",
      origin: "monitor",
      source_id: "fonte-1",
      agency: "Instituição Fictícia",
      deadline: "2026-11-30T23:59:00-03:00",
      status: "open",
      total_amount: 10000000,
      summary: "Edital fictício de apoio à produção de longas-metragens de ficção e documentário.",
      eligible_territories: ["BR"],
    });
    // Cópia da página guardada no armazenamento, na pasta da organização.
    expect([...supabase.files.keys()].every((path) => path.startsWith(`${ORG}/captures/`))).toBe(
      true,
    );
    expect(supabase.files.size).toBe(2);
  });

  it("diretriz territorial: edital exclusivo de outro município é descartado com motivo e evidência", () => {
    const rejected = db.editais!.find((e) => String(e.official_url).includes("curtas-rj"));
    expect(rejected).toMatchObject({
      review_status: "discarded",
      origin: "monitor",
      eligible_territories: ["RJ:Rio de Janeiro"],
    });
    expect(String(rejected!.triage_reason)).toContain("Descartado automaticamente");
    expect(String(rejected!.triage_reason)).toContain("a LEP Filmes é sediada em São Paulo/SP");
    expect(String(rejected!.triage_reason)).toContain("sediadas no municipio do rio de janeiro");
    expect(db.monitor_runs!.find((run) => run.source_id === "fonte-1")).toMatchObject({
      imported: 1,
      rejected: 1,
    });
  });

  it("ignora ruído (resultado) e páginas proibidas pelo robots.txt", () => {
    const urls = db.editais!.map((edital) => edital.official_url);
    expect(urls.some((url) => String(url).includes("resultado"))).toBe(false);
    expect(urls.some((url) => String(url).includes("/privado/"))).toBe(false);
  });

  it("fonte com problema é registrada como erro, sem interromper as demais", () => {
    const failed = db.monitor_runs!.find((run) => run.source_id === "fonte-2");
    expect(failed).toMatchObject({ status: "error", trigger: "cron" });
    expect(db.edital_sources!.find((source) => source.id === "fonte-2")).toMatchObject({
      last_status: "error",
    });
    expect(db.edital_sources!.find((source) => source.id === "fonte-1")).toMatchObject({
      last_status: "ok",
      last_imported: 1,
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
    });
    // O descartado também não volta: o link continua conhecido.
    expect(db.editais).toHaveLength(2);
    expect(db.monitor_runs!.filter((run) => run.source_id === "fonte-1")).toHaveLength(2);
  });
});
