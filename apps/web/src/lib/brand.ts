/**
 * Logomarca oficial da LEP Filmes (alta resolução, fundo transparente).
 * As dimensões reais são usadas pelo next/image para manter a proporção:
 * a altura é definida por CSS e a largura acompanha automaticamente.
 * O logo antigo (/logo.jpg) permanece em public/ apenas para reversão.
 */
export const LEP_LOGO = {
  src: "/brand/lep-logo.png",
  width: 3000,
  height: 2343,
  alt: "LEP Filmes",
} as const;
