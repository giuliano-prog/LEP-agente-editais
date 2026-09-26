import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicAddress, UnsafeUrlError } from "./network-guard";

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "200.160.2.3", "2001:4860:4860::8888"])("permite IP público %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "não-é-ip",
  ])("bloqueia %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("aceita links públicos http(s)", () => {
    expect(assertSafeUrl(" https://riofilme.com.br/editais/ ").hostname).toBe("riofilme.com.br");
  });

  it.each([
    ["file:///etc/passwd", "Somente links"],
    ["ftp://exemplo.com/a.pdf", "Somente links"],
    ["http://127.0.0.1/admin", "rede interna"],
    ["http://[::1]/", "rede interna"],
    ["http://169.254.169.254/latest/meta-data", "rede interna"],
    ["http://localhost:3000", "Porta"],
    ["http://localhost/", "rede interna"],
    ["https://user:senha@exemplo.com", "usuário/senha"],
    ["https://exemplo.com:22/", "Porta"],
    ["não é url", "inválida"],
  ])("rejeita %s", (url, message) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl(url)).toThrow(message);
  });
});
