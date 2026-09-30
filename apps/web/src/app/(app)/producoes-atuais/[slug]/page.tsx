import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductionSheet } from "@/components/productions/production-sheet";
import { requireMembership } from "@/lib/auth/session";
import { demoProduction } from "@/lib/demo/productions";
import { STAGE_LABELS } from "@/lib/productions/model";

export const metadata: Metadata = { title: "Produção" };

/** Ficha de uma produção atual (V1: exemplo demonstrativo; mesma ficha das concluídas). */
export default async function CurrentProductionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ area?: string }>;
}) {
  await requireMembership();
  const [{ slug }, { area }] = await Promise.all([params, searchParams]);
  const production = demoProduction(slug);
  if (!production) notFound();

  return (
    <ProductionSheet
      title={production.title}
      stage={production.stage}
      isDemo
      navigation="blocks"
      basePath={`/producoes-atuais/${production.slug}`}
      area={area}
      back={{ href: "/producoes-atuais", label: "Produções Atuais" }}
      facts={[{ label: "Etapa", value: STAGE_LABELS[production.stage] }]}
    />
  );
}
