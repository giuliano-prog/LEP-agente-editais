"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES } from "@/lib/profile/avatar-rules";

/**
 * Campo de foto de perfil (opcional). Só avisa na tela; a validação que vale
 * (tipo real e tamanho) é feita no servidor e no bucket.
 */
export function AvatarField({
  name,
  currentUrl = null,
  allowRemove = false,
}: {
  /** Nome exibido nas iniciais quando não há foto. */
  name: string | null;
  currentUrl?: string | null;
  allowRemove?: boolean;
}) {
  const [warning, setWarning] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-fg">Foto de perfil (opcional)</span>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={currentUrl} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="file"
            name="avatar"
            accept={AVATAR_ACCEPT}
            aria-label="Foto de perfil"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setWarning(
                file && file.size > AVATAR_MAX_BYTES ? "A foto deve ter no máximo 2 MB." : null,
              );
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-card-raised file:px-3 file:py-1.5 file:text-sm file:text-fg hover:file:border-brand"
          />
          <p className="text-xs text-muted">
            JPG, PNG ou WebP, até 2 MB. Sem foto, usamos as iniciais.
          </p>
          {warning && (
            <p role="alert" className="text-xs text-bad">
              {warning}
            </p>
          )}
          {allowRemove && currentUrl && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="remove_avatar" value="1" className="accent-brand" />
              Remover foto atual
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
