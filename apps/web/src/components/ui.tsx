export { Logo } from "./logo";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card p-6 ${className}`}>{children}</section>;
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
      <div className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem] sm:leading-tight">
          {title}
        </h1>
        {description && (
          <div className="max-w-3xl text-sm leading-relaxed text-muted">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  brand: "border-brand/40 bg-brand/10 text-brand",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  neutral: "border-line-strong bg-card-raised text-muted",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-card/40 px-6 py-12 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 block h-1 w-8 rounded-full bg-gradient-to-r from-brand-red to-brand opacity-70"
      />
      <p className="font-medium text-fg">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>
      )}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="eyebrow mb-4 flex items-center gap-3 after:h-px after:flex-1 after:bg-line">
      {children}
    </h2>
  );
}
