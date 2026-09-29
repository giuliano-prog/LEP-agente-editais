import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Autenticação das rotas de cron (Vercel Cron envia "Authorization: Bearer <CRON_SECRET>").
 * Comparação em tempo constante; sem segredo (ou curto demais), nada é autorizado.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
