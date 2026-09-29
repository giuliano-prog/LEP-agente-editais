import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Supabase falso em memória, SOMENTE para testes: responde às rotas do PostgREST
 * e do Storage usadas pela varredura. Não implementa RLS (simula a chave de serviço).
 */
export type FakeDb = Record<string, Record<string, unknown>[]>;

const read = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

function applyFilters(rows: Record<string, unknown>[], params: URLSearchParams) {
  let result = rows;
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (value.startsWith("eq."))
      result = result.filter((row) => String(row[key]) === decodeURIComponent(value.slice(3)));
    if (value.startsWith("in.(")) {
      const list = value
        .slice(4, -1)
        .split(",")
        .map((item) => item.replace(/^"|"$/g, ""));
      result = result.filter((row) => list.includes(String(row[key])));
    }
  }
  const limit = params.get("limit");
  return limit ? result.slice(0, Number(limit)) : result;
}

export async function startFakeSupabase(db: FakeDb) {
  const files = new Map<string, Buffer>();
  let seq = 0;
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const send = (status: number, payload?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };

    const object = url.pathname.match(/^\/storage\/v1\/object\/edital-documents\/(.+)$/);
    if (object && req.method === "POST") {
      files.set(decodeURIComponent(object[1]!), await read(req));
      return send(200, { Key: object[1] });
    }
    if (url.pathname === "/storage/v1/object/edital-documents" && req.method === "DELETE") {
      const { prefixes } = JSON.parse((await read(req)).toString()) as { prefixes: string[] };
      prefixes.forEach((prefix) => files.delete(prefix));
      return send(200, []);
    }
    // Reserva atômica do contador mensal (core.reserve_search_request). Uma linha em
    // db.__fail_reserve simula falha do banco.
    if (url.pathname === "/rest/v1/rpc/reserve_search_request") {
      const args = JSON.parse((await read(req)).toString()) as {
        p_org_id: string;
        p_limit: number;
      };
      if ((db.__fail_reserve ?? []).length > 0) return send(500, { message: "falha simulada" });
      db.search_api_usage ??= [];
      let row = db.search_api_usage.find((item) => item.org_id === args.p_org_id);
      if (!row) {
        row = { org_id: args.p_org_id, month: "2026-09", requests: 0 };
        db.search_api_usage.push(row);
      }
      if (args.p_limit <= 0 || Number(row.requests) >= args.p_limit) return send(200, false);
      row.requests = Number(row.requests) + 1;
      return send(200, true);
    }
    if (url.pathname === "/rest/v1/rpc/create_edital_with_document") {
      const args = JSON.parse((await read(req)).toString()) as Record<string, unknown>;
      const id = `edital-${++seq}`;
      db.editais!.push({
        id,
        org_id: args.p_org_id,
        title: args.p_title,
        official_url: args.p_official_url,
        review_status: "pending",
      });
      db.edital_documents!.push({
        id: `doc-${seq}`,
        org_id: args.p_org_id,
        edital_id: id,
        source_url: args.p_source_url,
        final_url: args.p_final_url,
        sha256: args.p_sha256,
        storage_path: args.p_storage_path,
      });
      return send(200, id);
    }

    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table) return send(404, { message: `não simulado: ${url.pathname}` });
    db[table] ??= [];
    const rows = db[table]!;
    if (req.method === "POST") {
      const input = JSON.parse((await read(req)).toString());
      // Upsert (on_conflict): atualiza a linha existente com as mesmas colunas-chave.
      const conflict = url.searchParams.get("on_conflict")?.split(",") ?? null;
      // Como o PostgREST: gera id e devolve as linhas quando pedido (return=representation).
      const inserted = (Array.isArray(input) ? input : [input]).map(
        (row: Record<string, unknown>) => {
          const existing = conflict
            ? rows.find((item) => conflict.every((column) => item[column] === row[column]))
            : undefined;
          if (existing) return Object.assign(existing, row);
          const created = { id: `${table}-${++seq}`, ...row };
          rows.push(created);
          return created;
        },
      );
      if (!(req.headers.prefer ?? "").includes("return=representation")) return send(201);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      return send(201, single ? inserted[0] : inserted);
    }
    let matched = applyFilters(rows, url.searchParams);
    if (req.method === "PATCH") {
      const patch = JSON.parse((await read(req)).toString());
      matched.forEach((row) => Object.assign(row, patch));
      return send(204);
    }
    if (table === "edital_documents") {
      matched = matched.map((row) => ({
        ...row,
        editais: db.editais!.find((e) => e.id === row.edital_id) ?? null,
      }));
    }
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (single)
      return matched.length
        ? send(200, matched[0])
        : send(406, { code: "PGRST116", message: "no rows" });
    return send(200, matched);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    files,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
