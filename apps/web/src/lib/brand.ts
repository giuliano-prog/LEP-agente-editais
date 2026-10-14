/**
 * Logomarca oficial da LEP Filmes (alta resolução, fundo transparente).
 * As dimensões reais são usadas pelo next/image para manter a proporção:
 * a altura é definida por CSS e a largura acompanha automaticamente.
 * Origem: assets/brand/LEP Filmes Logo on Transparency.png (só a margem transparente foi
 * recortada; cores e proporção originais). Os logos antigos permanecem em public/ só para reversão.
 */
export const LEP_LOGO = {
  src: "/brand/lep-filmes-logo.png",
  width: 999,
  height: 887,
  alt: "LEP Filmes",
} as const;
