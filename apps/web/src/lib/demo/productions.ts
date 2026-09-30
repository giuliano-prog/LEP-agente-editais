/**
 * DADOS DEMONSTRATIVOS DA V1 — Produções Atuais.
 *
 * - Definidos só em código: nunca gravados no Supabase (nem em seed ou migração).
 * - Não entram em contagens reais (a Home mostra 0 em Produções Atuais).
 * - A tela identifica cada card como "Exemplo".
 * Serão substituídos pela consulta ao banco quando o ciclo de vida das produções
 * existir em `core.projetos` (ver `lib/productions/model.ts`).
 */
import type { ProductionStage } from "@/lib/productions/model";

export type DemoProduction = {
  slug: string;
  title: string;
  stage: ProductionStage;
};

export const DEMO_CURRENT_PRODUCTIONS: DemoProduction[] = [
  { slug: "producao-01", title: "Nome da Produção 01", stage: "budgeting" },
  { slug: "producao-02", title: "Nome da Produção 02", stage: "in_production" },
];

export function demoProduction(slug: string): DemoProduction | null {
  return DEMO_CURRENT_PRODUCTIONS.find((production) => production.slug === slug) ?? null;
}
