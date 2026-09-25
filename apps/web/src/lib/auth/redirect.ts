/**
 * Aceita apenas caminhos internos (ex.: "/conta/senha") para evitar
 * redirecionamento aberto para sites externos via parâmetro `next`.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
