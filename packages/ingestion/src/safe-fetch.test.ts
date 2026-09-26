import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FetchError, safeFetch } from "./safe-fetch";
import { UnsafeUrlError } from "./network-guard";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/pagina") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end("<html><title>Edital</title></html>");
    }
    if (req.url === "/redireciona") {
      res.writeHead(302, { location: "/pagina" });
      return res.end();
    }
    if (req.url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      return res.end();
    }
    if (req.url === "/grande") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(Buffer.alloc(2048, 1));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const test = { allowPrivateNetworkForTests: true };

describe("safeFetch", () => {
  it("bloqueia rede interna por padrão", async () => {
    await expect(safeFetch(`${base}/pagina`)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("baixa o conteúdo e segue redirecionamentos", async () => {
    const result = await safeFetch(`${base}/redireciona`, test);
    expect(result.finalUrl).toBe(`${base}/pagina`);
    expect(result.contentType).toContain("text/html");
    expect(result.body.toString()).toContain("<title>Edital</title>");
  });

  it("interrompe downloads acima do limite", async () => {
    await expect(safeFetch(`${base}/grande`, { ...test, maxBytes: 1024 })).rejects.toThrow(
      "maior que o limite",
    );
  });

  it("limita a quantidade de redirecionamentos", async () => {
    await expect(safeFetch(`${base}/loop`, { ...test, maxRedirects: 3 })).rejects.toThrow(
      "Redirecionamentos demais",
    );
  });

  it("informa erro HTTP do site", async () => {
    await expect(safeFetch(`${base}/nao-existe`, test)).rejects.toBeInstanceOf(FetchError);
    await expect(safeFetch(`${base}/nao-existe`, test)).rejects.toThrow("HTTP 404");
  });
});
