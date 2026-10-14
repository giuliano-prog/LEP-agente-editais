/**
 * Classes da Área de Trabalho, no padrão visual atual da `main`. Centralizadas aqui
 * para facilitar a troca pelas classes do design system (`btn`, `card`, `control`)
 * quando a modernização visual for integrada.
 */
export const S = {
  card: "rounded-xl border border-line bg-card",
  primary:
    "rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60",
  secondary:
    "rounded-md border border-line px-3 py-1.5 text-sm transition hover:border-brand hover:text-brand disabled:opacity-60",
  small:
    "rounded-md border border-line px-2.5 py-1 text-xs transition hover:border-brand hover:text-brand",
  danger:
    "rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-bad hover:text-bad",
  control:
    "w-full rounded-md border border-line bg-card-raised px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand",
  label: "block space-y-1 text-sm",
  eyebrow: "text-xs uppercase tracking-wider text-muted",
} as const;
