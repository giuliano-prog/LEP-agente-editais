import { BlockList, isIP } from "node:net";

/**
 * Proteção contra SSRF: o servidor só busca URLs públicas.
 * Bloqueia redes privadas, loopback, link-local (inclui 169.254.169.254, metadados
 * de nuvem), CGNAT, multicast e reservadas — em IPv4 e IPv6.
 */
const blocked = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** `true` se o IP é público (permitido). */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blocked.check(address, "ipv4");
  if (version === 6) {
    // IPv4 mapeado em IPv6 (::ffff:10.0.0.1) é avaliado como IPv4.
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPublicAddress(mapped[1]);
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export const ALLOWED_PORTS = new Set(["", "80", "443"]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Valida formato, protocolo, porta e credenciais da URL (antes de qualquer conexão). */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("URL inválida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("Somente links http:// ou https:// são aceitos.");
  }
  if (url.username || url.password)
    throw new UnsafeUrlError("Links com usuário/senha não são aceitos.");
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError("Porta não permitida.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host))
    throw new UnsafeUrlError("Endereço de rede interna não permitido.");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new UnsafeUrlError("Endereço de rede interna não permitido.");
  }
  return url;
}
