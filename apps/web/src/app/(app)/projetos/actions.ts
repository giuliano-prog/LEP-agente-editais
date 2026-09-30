"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { projectInputSchema } from "@lep/projects";
import { requireMembership } from "@/lib/auth/session";
import { persistMatches } from "@/lib/editais/matches";
import { createClient } from "@/lib/supabase/server";

export type ProjectFormState = { error?: string; success?: string; savedAt?: number };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  // Permissão verificada aqui e, de novo, pelo RLS no banco.
  const { membership } = await requireMembership("editor");

  const parsed = projectInputSchema.safeParse({
    title: formData.get("title"),
    format: formData.get("format"),
    genre: formData.get("genre"),
    stage: formData.get("stage"),
    budget: formData.get("budget") ?? "",
    synopsis: formData.get("synopsis") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projetos")
    .insert({ ...parsed.data, org_id: membership.orgId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Erro ao cadastrar projeto:", error?.code);
    return { error: "Não foi possível cadastrar a produção. Tente novamente." };
  }

  // Novo projeto: recalcula e grava o Match v2 com todos os editais.
  await persistMatches(supabase, membership.orgId, "all");
  revalidatePath("/projetos");
  revalidatePath("/editais");
  // Abre a ficha da produção recém-cadastrada.
  redirect(`/projetos/${data.id}`);
}
