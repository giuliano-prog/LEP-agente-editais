"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UF_NAMES } from "@lep/funding";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ProponentState = { error?: string; success?: string };

const schema = z.object({
  hq_state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value in UF_NAMES, { message: "Selecione a UF da sede." }),
  hq_city: z.string().trim().min(2, "Informe o município da sede.").max(120),
});

/** Sede do proponente (diretriz nº 1). Somente administradores. */
export async function updateProponent(
  _prev: ProponentState,
  formData: FormData,
): Promise<ProponentState> {
  const { membership } = await requireMembership("admin");
  const parsed = schema.safeParse({
    hq_state: formData.get("hq_state") ?? "",
    hq_city: formData.get("hq_city") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", membership.orgId);
  if (error) {
    console.error("Erro ao salvar sede:", error.code);
    return {
      error:
        "Não foi possível salvar. Confira se a migração de diretrizes foi aplicada (Diagnóstico).",
    };
  }
  revalidatePath("/", "layout");
  return { success: "Sede atualizada. A aderência dos editais já considera o novo endereço." };
}
