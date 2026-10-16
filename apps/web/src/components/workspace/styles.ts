/**
 * Classes da Área de Trabalho e do Assistente LEP, apontando para o design system
 * (`globals.css`: `card`, `btn`, `control`, `eyebrow`). Centralizadas aqui para que
 * as telas da inscrição acompanhem qualquer ajuste visual num só lugar.
 */
export const S = {
  card: "card",
  primary: "btn btn-primary",
  secondary: "btn btn-sm btn-secondary",
  small: "btn btn-xs btn-secondary",
  /** Ação positiva compacta (Concluir, Aprovar, Resolver, Aplicar sugestão). */
  confirm: "btn btn-xs btn-secondary border-ok/50 hover:border-ok hover:text-ok",
  danger: "btn btn-xs btn-danger",
  control: "control",
  label: "block space-y-1 text-sm",
  eyebrow: "eyebrow",
} as const;
