import { initials } from "@/lib/navigation";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

/**
 * Foto do membro/profissional ou, sem foto, as iniciais do nome. Hoje não há
 * armazenamento de fotos: `src` fica preparado para quando houver (sempre opcional).
 */
export function Avatar({
  name,
  src = null,
  size = "md",
}: {
  name: string | null;
  src?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto opcional de origem própria
      <img
        src={src}
        alt=""
        className={`${SIZES[size]} shrink-0 rounded-full border border-line object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 font-semibold text-brand`}
    >
      {initials(name)}
    </span>
  );
}
