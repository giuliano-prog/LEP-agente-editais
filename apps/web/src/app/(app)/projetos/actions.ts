"use server";

import { revalidatePath } from "next/cache";
import { projectInputSchema } from "@lep/projects";
import { requireMembership } from "@/lib/auth/session";
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
  const { error } = await supabase
    .from("projetos")
    .insert({ ...parsed.data, org_id: membership.orgId });
  if (error) {
    console.error("Erro ao cadastrar projeto:", error.code);
    return { error: "Não foi possível cadastrar o projeto. Tente novamente." };
  }

  revalidatePath("/projetos");
  return { success: `Projeto "${parsed.data.title}" cadastrado.`, savedAt: Date.now() };
}
