import { hasRole, type Role } from "./roles";

/**
 * Permissões nomeadas usadas pela interface. A segurança real é garantida pelas
 * políticas RLS do banco; aqui decidimos apenas o que mostrar/permitir na tela.
 * Novos módulos adicionam suas permissões a este mapa.
 *
 * Ponto único de decisão: telas e menus perguntam `can(role, "<permissão>")`, nunca
 * comparam papéis diretamente. Permissões granulares futuras (por módulo, produção,
 * seção ou ação — ex.: "producoes.orcamento.edit" numa produção específica) entram aqui,
 * ampliando `can` com um escopo opcional, sem espalhar checagens pela interface.
 */
export const PERMISSIONS = {
  "content.read": "viewer",
  "content.edit": "editor",
  "content.review": "editor",
  "org.manage": "admin",
  "members.manage": "admin",
  "ai_usage.read": "admin",
  "audit.read": "admin",
  /** Lista de membros (quem usa a plataforma); gerenciar continua sendo `members.manage`. */
  "members.read": "viewer",
  /** Diagnóstico da configuração (Supabase/Vercel): somente ADM. */
  "diagnostics.view": "admin",
  /**
   * Executar buscas de editais (fontes cadastradas e web): Diretoria e ADM (pedido da LEP de 2026-10-15).
   * Usa a chave de serviço no servidor e tem custo — limitado pelos tetos por execução e mensal (ADR-0024).
   * Cadastrar/editar/excluir fontes continua só do ADM.
   */
  "editais.search": "editor",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return hasRole(role, PERMISSIONS[permission]);
}
