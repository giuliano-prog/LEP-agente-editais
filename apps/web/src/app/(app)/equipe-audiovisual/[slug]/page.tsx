import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { demoProfessional } from "@/lib/demo/professionals";
import { PROFESSIONAL_FIELDS, categoriesOf, type Professional } from "@/lib/team/model";

export const metadata: Metadata = { title: "Ficha do Profissional" };

function display(value: Professional[keyof Professional]): string | null {
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return typeof value === "string" && value.trim() ? value : null;
}

/** Ficha do profissional. Campos sem dado aparecem como "Não informado" (nada é inventado). */
export default async function ProfessionalPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireMembership();
  const { slug } = await params;
  const professional = demoProfessional(slug);
  if (!professional) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/equipe-audiovisual" className="inline-block text-sm text-muted hover:text-brand">
        ← Equipe Audiovisual
      </Link>

      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card p-5">
        <Avatar name={professional.name} src={professional.photoUrl} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{professional.name}</h1>
          <p className="text-muted">{professional.mainRole}</p>
          <div className="flex flex-wrap gap-1.5">
            {categoriesOf(professional).map((category) => (
              <Badge key={category.key} tone="brand">
                {category.label}
              </Badge>
            ))}
            <Badge>Exemplo</Badge>
          </div>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        {PROFESSIONAL_FIELDS.map((field) => {
          const value = display(professional[field.key]);
          return (
            <div key={field.key} className="min-w-0 rounded-xl border border-line bg-card p-4">
              <dt className="text-xs uppercase tracking-wider text-muted">{field.label}</dt>
              <dd className={`mt-1 break-words text-sm ${value ? "" : "text-muted"}`}>
                {value ?? "Não informado"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
