import type { Metadata } from "next";
import { ROLE_LABELS } from "@lep/core";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membros" };

export default async function MembersPage() {
  const { membership } = await requireMembership("admin");
  const supabase = await createClient();

  // O RLS garante que só membros da própria organização retornam.
  const { data: members, error } = await supabase
    .from("memberships")
    .select("id, role, created_at, profiles ( email, full_name )")
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Membros</h1>
        <p className="text-sm text-zinc-600">
          Somente leitura nesta etapa. Convites e alteração de papéis são feitos pelo script de
          administração (ver README) e ganharão tela própria em etapa futura.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700">Não foi possível carregar os membros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Desde</th>
              </tr>
            </thead>
            <tbody>
              {members?.map((member) => (
                <tr key={member.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">{member.profiles?.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{member.profiles?.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[member.role]}</td>
                  <td className="px-4 py-3">
                    {new Date(member.created_at).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
