/**
 * Fontes sugeridas de editais de audiovisual. Os endereços são pontos de partida:
 * confirme a página de listagem de cada órgão — se estiver errado, a varredura
 * mostra o erro na tela de fontes e o endereço pode ser corrigido.
 */
export const SUGGESTED_SOURCES = [
  {
    name: "RioFilme — Editais",
    agency: "RioFilme",
    list_url: "https://riofilme.com.br/editais/",
    audiovisual_only: true,
    link_contains: "/editais/",
  },
  {
    name: "Spcine — Editais",
    agency: "Spcine",
    list_url: "https://spcine.com.br/editais/",
    audiovisual_only: true,
    link_contains: null,
  },
  {
    name: "ANCINE — Fundo Setorial do Audiovisual (FSA)",
    agency: "ANCINE / FSA",
    list_url: "https://www.gov.br/ancine/pt-br/fsa",
    audiovisual_only: true,
    link_contains: null,
  },
] as const;
