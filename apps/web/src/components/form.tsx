"use client";

import { useFormStatus } from "react-dom";

const controlClass =
  "w-full rounded-md border border-line bg-card-raised px-3 py-2 text-sm text-fg placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-1 focus:ring-brand";

function Label({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <Label label={label} hint={hint}>
      <input {...props} className={controlClass} />
    </Label>
  );
}

export function TextArea({
  label,
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <Label label={label} hint={hint}>
      <textarea {...props} className={`${controlClass} min-h-28`} />
    </Label>
  );
}

export function Select({
  label,
  options,
  placeholder = "Selecione…",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <Label label={label}>
      <select {...props} className={controlClass}>
        <option value="">{placeholder}</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Aguarde…" : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
      {message}
    </p>
  );
}
