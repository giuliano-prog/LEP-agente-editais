/**
 * Vocabulário controlado de projetos. Os códigos (em inglês) são gravados no banco
 * (core.projetos) e usados nas regras dos editais (accepted_formats, accepted_genres,
 * accepted_stages). Os rótulos são exibidos na interface.
 * Manter em sincronia com as CHECK constraints da migração de core.projetos.
 */
export const PROJECT_FORMATS = {
  feature_film: "Longa-metragem",
  short_film: "Curta-metragem",
  series: "Série",
  tv_movie: "Telefilme",
  other: "Outro",
} as const;

/** Tipologia usada pelos editais (ficção, documentário, animação). */
export const PROJECT_GENRES = {
  fiction: "Ficção",
  documentary: "Documentário",
  animation: "Animação",
  hybrid: "Híbrido",
  other: "Outro",
} as const;

export const PROJECT_STAGES = {
  development: "Desenvolvimento",
  pre_production: "Pré-produção",
  production: "Produção",
  post_production: "Pós-produção / Finalização",
  distribution: "Distribuição",
  completed: "Concluído",
} as const;

export type ProjectFormat = keyof typeof PROJECT_FORMATS;
export type ProjectGenre = keyof typeof PROJECT_GENRES;
export type ProjectStage = keyof typeof PROJECT_STAGES;

type Vocabulary = Record<string, string>;

/** Rótulo em português; códigos desconhecidos são exibidos como vieram. */
export function labelOf(vocabulary: Vocabulary, code: string | null | undefined): string {
  if (!code) return "—";
  return vocabulary[code] ?? code;
}

export const keysOf = <T extends Vocabulary>(vocabulary: T) =>
  Object.keys(vocabulary) as [keyof T & string, ...(keyof T & string)[]];
