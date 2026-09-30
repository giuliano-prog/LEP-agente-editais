"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { memberNameSchema } from "@/lib/members/create";
import { uploadedFile } from "@/lib/profile/avatar-rules";
import { saveProfile } from "@/lib/profile/save";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { error?: string; success?: string; savedAt?: number };

/**
 * Minha conta: a própria pessoa altera SÓ o próprio nome e a própria foto.
 * Usa a sessão (RLS `profiles_update_self` + Storage na própria pasta); o id vem da
 * sessão, nunca do formulário. Perfil de acesso (papel) não é alterável aqui.
 */
export async function updateMyProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { userId } = await requireUser();
  const name = memberNameSchema.safeParse(formData.get("full_name") ?? "");
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Nome inválido." };

  const supabase = await createClient();
  const result = await saveProfile(supabase, userId, {
    fullName: name.data,
    avatar: uploadedFile(formData.get("avatar")),
    removeAvatar: formData.get("remove_avatar") === "1",
  });
  if (!result.ok) return { error: result.error };

  // Nome e foto aparecem no menu e na Home de todas as páginas.
  revalidatePath("/", "layout");
  return { success: "Dados atualizados.", savedAt: Date.now() };
}
