"use client";

import { useState } from "react";
import { measureText } from "@lep/funding";
import { S } from "./styles";

/**
 * Rascunho de um texto exigido, com contagem ao vivo frente aos limites do edital
 * (caracteres com espaços, palavras e páginas estimadas). O texto é salvo no servidor.
 */
export function TextDraft({
  name = "content",
  initial,
  charLimit,
  wordLimit,
  pageLimit,
  readOnly,
}: {
  name?: string;
  initial: string | null;
  charLimit: number | null;
  wordLimit: number | null;
  pageLimit: number | null;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");
  const metrics = measureText(value, { charLimit, wordLimit, pageLimit });
  const counter = (label: string, current: number, limit: number | null, over: boolean) => (
    <span className={over ? "font-medium text-bad" : limit ? "text-fg" : "text-muted"}>
      {label}: {current.toLocaleString("pt-BR")}
      {limit ? ` / ${limit.toLocaleString("pt-BR")}` : ""}
    </span>
  );
  return (
    <div className="space-y-2">
      <textarea
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        readOnly={readOnly}
        rows={8}
        maxLength={50_000}
        placeholder={
          readOnly
            ? "Sem texto registrado."
            : "Cole ou escreva aqui a versão do texto para a inscrição."
        }
        className={`${S.control} min-h-40 font-[inherit] leading-relaxed`}
        aria-describedby={`${name}-contagem`}
      />
      <p
        id={`${name}-contagem`}
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-live="polite"
      >
        {counter("Caracteres (com espaços)", metrics.chars, charLimit, metrics.overChars)}
        {counter("Palavras", metrics.words, wordLimit, metrics.overWords)}
        {counter("Páginas (estimativa)", metrics.estimatedPages, pageLimit, metrics.overPages)}
      </p>
    </div>
  );
}
