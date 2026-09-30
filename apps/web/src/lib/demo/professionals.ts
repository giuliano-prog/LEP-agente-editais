/**
 * DADOS DEMONSTRATIVOS DA V1 — Equipe Audiovisual.
 *
 * - Definidos só em código: nunca gravados no Supabase (nem em seed ou migração).
 * - Não entram em contagens reais (a Home mostra 0 em Equipe Audiovisual).
 * - Só nome e função principal: nenhum telefone, endereço, currículo, cachê ou outro
 *   dado pessoal é inventado — os demais campos ficam vazios de propósito.
 */
import type { Professional } from "@/lib/team/model";

const empty = {
  otherRoles: [],
  location: null,
  contact: null,
  experience: null,
  portfolioUrl: null,
  cvUrl: null,
  availability: null,
  referenceFee: null,
  lepProductions: [],
  internalNotes: null,
  photoUrl: null,
} satisfies Omit<Professional, "slug" | "name" | "mainRole">;

export const DEMO_PROFESSIONALS: Professional[] = [
  {
    slug: "giuliano-carvalho",
    name: "Giuliano Carvalho",
    mainRole: "Assistente de Platô",
    ...empty,
  },
];

export function demoProfessional(slug: string): Professional | null {
  return DEMO_PROFESSIONALS.find((professional) => professional.slug === slug) ?? null;
}
