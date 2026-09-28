"use client";

import { useActionState } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@lep/core";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/form";
import {
  inviteMemberAction,
  resendInviteAction,
  setMemberStatusAction,
  type MemberActionState,
} from "./actions";

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
