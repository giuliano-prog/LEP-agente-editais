/**
 * Equipe Audiovisual: banco de PROFISSIONAIS (não são usuários da plataforma —
 * quem tem login fica em Membros). Um profissional pode exercer várias funções.
 *
 * Direção futura (não implementada): a plataforma poderá SUGERIR equipes para uma
 * produção cruzando funções, localização, disponibilidade, experiência, histórico com
 * a LEP e orçamento — sempre como sugestão, nunca escalando ninguém automaticamente.
 */
import { normalizeTitle } from "@/lib/productions/media";

export type Professional = {
  slug: string;
  name: string;
  mainRole: string;
  otherRoles: string[];
  /** Cidade/UF. */
  location: string | null;
  contact: string | null;
  experience: string | null;
  portfolioUrl: string | null;
  cvUrl: string | null;
  availability: string | null;
  referenceFee: string | null;
  lepProductions: string[];
  internalNotes: string | null;
  photoUrl: string | null;
};

export type TeamCategory = { key: string; label: string; roles: string[] };

/** Categorias de navegação. Novas funções/categorias entram aqui (lista aberta). */
export const TEAM_CATEGORIES: TeamCategory[] = [
  { key: "direcao", label: "Direção", roles: ["Direção", "Assistente de Direção"] },
  { key: "roteiro", label: "Roteiro", roles: ["Roteiro"] },
  { key: "producao-executiva", label: "Produção Executiva", roles: ["Produção Executiva"] },
  {
    key: "producao",
    label: "Produção",
    roles: ["Direção de Produção", "Produção", "Produtora", "Produtor"],
  },
  {
    key: "assistencia-producao",
    label: "Assistência de Produção",
    roles: ["Assistente de Produção"],
  },
  { key: "plato", label: "Platô", roles: ["Assistente de Platô", "Continuidade"] },
  { key: "fotografia", label: "Direção de Fotografia", roles: ["Direção de Fotografia"] },
  {
    key: "camera",
    label: "Câmera",
    roles: ["Câmera", "Assistente de Câmera", "Elétrica / Gaffer", "Maquinaria"],
  },
  { key: "som", label: "Som", roles: ["Som Direto", "Desenho de Som / Mixagem"] },
  { key: "arte", label: "Arte", roles: ["Direção de Arte", "Cenografia"] },
  { key: "maquiagem-figurino", label: "Maquiagem / Figurino", roles: ["Maquiagem", "Figurino"] },
  { key: "elenco", label: "Atrizes e Atores", roles: ["Atriz", "Ator", "Casting"] },
  {
    key: "pos-producao",
    label: "Pós-produção",
    roles: ["Montagem / Edição", "Finalização / Cor"],
  },
];

/** Todas as funções conhecidas (para o cadastro). */
export const TEAM_ROLES: string[] = TEAM_CATEGORIES.flatMap((category) => category.roles);

export function categoriesOf(professional: Pick<Professional, "mainRole" | "otherRoles">) {
  const roles = [professional.mainRole, ...professional.otherRoles];
  return TEAM_CATEGORIES.filter((category) => category.roles.some((role) => roles.includes(role)));
}

/** Busca por nome ou função (sem diferenciar acentos) e filtro por categoria. */
export function filterProfessionals(
  professionals: Professional[],
  { query = "", category = null }: { query?: string; category?: string | null },
): Professional[] {
  const needle = normalizeTitle(query);
  return professionals.filter((professional) => {
    if (category && !categoriesOf(professional).some((item) => item.key === category)) {
      return false;
    }
    if (!needle) return true;
    return [professional.name, professional.mainRole, ...professional.otherRoles].some((text) =>
      normalizeTitle(text).includes(needle),
    );
  });
}

/** Campos da ficha do profissional, na ordem de exibição. */
export const PROFESSIONAL_FIELDS: { key: keyof Professional; label: string }[] = [
  { key: "mainRole", label: "Função principal" },
  { key: "otherRoles", label: "Outras funções" },
  { key: "location", label: "Localização (cidade/UF)" },
  { key: "contact", label: "Contato" },
  { key: "experience", label: "Experiência" },
  { key: "portfolioUrl", label: "Portfólio" },
  { key: "cvUrl", label: "Currículo" },
  { key: "availability", label: "Disponibilidade" },
  { key: "referenceFee", label: "Cachê de referência" },
  { key: "lepProductions", label: "Produções realizadas com a LEP" },
  { key: "internalNotes", label: "Observações internas" },
];
