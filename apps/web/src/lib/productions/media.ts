/**
 * Mídia das produções (trailer). `core.projetos` ainda não tem coluna de mídia; até lá
 * a associação fica aqui, por título, e só com links PÚBLICOS oficiais da produção.
 * Quando houver coluna própria, esta lista vira dado do banco.
 */
export type ProductionMedia = {
  /** Título normalizado (sem acentos, minúsculas) que identifica a produção. */
  title: string;
  youtubeId: string;
};

const MEDIA: ProductionMedia[] = [{ title: "a conspiracao condor", youtubeId: "TJXg83kcFMA" }];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Trailer da produção pelo título (com ou sem artigo "A"). */
export function mediaForProduction(title: string): ProductionMedia | null {
  const key = normalizeTitle(title);
  const found = MEDIA.find(
    (media) => media.title === key || media.title.replace(/^(a|o|as|os) /, "") === key,
  );
  return found && YOUTUBE_ID.test(found.youtubeId) ? found : null;
}

/** Player incorporado sem cookies de rastreamento (youtube-nocookie) e link externo. */
export function youtubeUrls(youtubeId: string): { embed: string; watch: string } {
  return {
    embed: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`,
    watch: `https://www.youtube.com/watch?v=${youtubeId}`,
  };
}
