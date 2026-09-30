"use client";

import { useActionState, useState } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@lep/core";
import { AvatarField } from "@/components/avatar-field";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/form";
import {
  createMemberAction,
  deleteMemberAction,
  inviteMemberAction,
  resendInviteAction,
  setMemberStatusAction,
  updateMemberProfileAction,
  type MemberActionState,
} from "./actions";

/** Criação direta pelo ADM: conta no Supabase Auth com senha inicial, sem e-mail. */
export function CreateMemberForm() {
  const [state, action] = useActionState<MemberActionState, FormData>(createMemberAction, {});
  return (
    <form key={state.savedAt ?? "create"} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome"
          name="full_name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Perfil" name="role" required options={ROLE_LABELS} defaultValue="viewer" />
        <Field
          label="Senha inicial"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          hint="Mínimo de 10 caracteres, com maiúsculas, minúsculas e números."
        />
      </div>
      <AvatarField name={null} />
      <p className="text-xs text-muted">
        A senha inicial vai direto para o Supabase Auth e não fica guardada na plataforma. Passe-a à
        pessoa por um canal seguro; ela pode trocá-la em Minha conta.
      </p>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Criar acesso</SubmitButton>
    </form>
  );
}

/** ADM completa nome e foto de um membro (o perfil de acesso não muda aqui). */
export function EditMemberForm({
  userId,
  fullName,
  avatarUrl,
  role,
  isSelf,
}: {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role;
  isSelf: boolean;
}) {
  const [state, action] = useActionState<MemberActionState, FormData>(
    updateMemberProfileAction,
    {},
  );
  return (
    <form key={state.savedAt ?? userId} action={action} className="mt-3 space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <Field
        label="Nome"
        name="full_name"
        required
        minLength={2}
        maxLength={120}
        defaultValue={fullName ?? ""}
      />
      <input type="hidden" name="current_role" value={role} />
      {isSelf ? (
        <p className="text-xs text-muted">
          Perfil de acesso: {ROLE_LABELS[role]} (você não pode alterar o próprio perfil).
        </p>
      ) : (
        <Select
          label="Perfil de acesso"
          name="role"
          required
          options={ROLE_LABELS}
          defaultValue={role}
        />
      )}
      <AvatarField name={fullName} currentUrl={avatarUrl} allowRemove />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}

/**
 * Exclusão permanente: exige digitar EXCLUIR e confirmar no diálogo. Não aparece para o
 * próprio usuário; o servidor repete todas as checagens (inclusive último ADM ativo).
 */
export function DeleteMemberForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(
    deleteMemberAction,
    {},
  );
  const [typed, setTyped] = useState("");
  if (state.success) {
    return (
      <p role="status" className="text-xs text-ok">
        {state.success}
      </p>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(`Excluir ${name} permanentemente? Esta ação não pode ser desfeita.`)) {
          event.preventDefault();
        }
      }}
      className="mt-3 space-y-3 rounded-md border border-bad/40 bg-bad/5 p-3"
    >
      <input type="hidden" name="user_id" value={userId} />
      <p className="text-xs text-bad">
        Ação permanente: remove o acesso de {name} e apaga a conta de login. Para só bloquear o
        acesso, use “Suspender”.
      </p>
      <Field
        label="Digite EXCLUIR para confirmar"
        name="confirmation"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      <FormError message={state.error} />
      <button
        type="submit"
        disabled={pending || typed.trim().toUpperCase() !== "EXCLUIR"}
        className="w-full rounded-md border border-bad px-3 py-2 text-sm font-semibold text-bad transition hover:bg-bad/10 disabled:opacity-40"
      >
        {pending ? "Excluindo…" : "Excluir usuário"}
      </button>
    </form>
  );
}

export function InviteForm() {
  const [state, action] = useActionState<MemberActionState, FormData>(inviteMemberAction, {});
  return (
    <form key={state.savedAt ?? "invite"} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="E-mail"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
        />
        <Field label="Nome (opcional)" name="full_name" maxLength={120} autoComplete="off" />
      </div>
      <Select label="Perfil" name="role" required options={ROLE_LABELS} defaultValue="viewer" />
      <ul className="space-y-1 text-xs text-muted">
        {[...ROLES].reverse().map((role) => (
          <li key={role}>
            <span className="font-medium text-fg">{ROLE_LABELS[role]}:</span>{" "}
            {ROLE_DESCRIPTIONS[role]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        A pessoa recebe um e-mail do Supabase e define a própria senha. A plataforma não pede nem
        guarda senhas.
      </p>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Enviar convite</SubmitButton>
    </form>
  );
}

const buttonClass =
  "rounded-md border border-line px-2.5 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-60";

/** Ações por linha: reenviar convite, suspender, reativar. */
export function MemberActions({
  membershipId,
  status,
  isSelf,
}: {
  membershipId: string;
  status: "invited" | "active" | "suspended";
  isSelf: boolean;
}) {
  const [resendState, resend, resending] = useActionState<MemberActionState, FormData>(
    resendInviteAction,
    {},
  );
  const [statusState, changeStatus, changing] = useActionState<MemberActionState, FormData>(
    setMemberStatusAction,
    {},
  );
  const message = resendState.error ?? statusState.error;
  const success = resendState.success ?? statusState.success;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {status === "invited" && (
          <form action={resend}>
            <input type="hidden" name="membership_id" value={membershipId} />
            <button type="submit" disabled={resending} className={buttonClass}>
              {resending ? "Enviando…" : "Reenviar convite"}
            </button>
          </form>
        )}
        {status !== "suspended" && !isSelf && (
          <form
            action={changeStatus}
            onSubmit={(event) => {
              if (!confirm("Suspender o acesso desta pessoa?")) event.preventDefault();
            }}
          >
            <input type="hidden" name="membership_id" value={membershipId} />
            <input type="hidden" name="intent" value="suspend" />
            <button type="submit" disabled={changing} className={buttonClass}>
              Suspender
            </button>
          </form>
        )}
        {status === "suspended" && (
          <form action={changeStatus}>
            <input type="hidden" name="membership_id" value={membershipId} />
            <input type="hidden" name="intent" value="reactivate" />
            <button type="submit" disabled={changing} className={buttonClass}>
              Reativar
            </button>
          </form>
        )}
        {isSelf && <span className="text-xs text-muted">Você</span>}
      </div>
      {message && (
        <p role="alert" className="text-xs text-bad">
          {message}
        </p>
      )}
      {!message && success && (
        <p role="status" className="text-xs text-ok">
          {success}
        </p>
      )}
    </div>
  );
}
