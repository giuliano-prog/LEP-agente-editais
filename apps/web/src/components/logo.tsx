"use client";

import Image from "next/image";
import { useState } from "react";

/*
 * Logomarca oficial (/public/logo.jpg, 666×551, marca centralizada sobre fundo
 * grafite com margem ampla). A moldura recorta a margem e amplia a marca para
 * que "LEP FILMES" fique legível em tamanhos pequenos (cabeçalho).
 */
const SIZES = {
  sm: "h-12 w-[60px]",
  lg: "h-24 w-[120px]",
} as const;

export function Logo({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Se o arquivo não carregar, o nome em texto evita imagem quebrada.
    return (
      <span
        className={`${SIZES[size]} inline-flex w-auto items-center rounded-md border border-line px-3 text-sm font-bold tracking-[0.25em]`}
      >
        <span className="text-brand">LEP</span>&nbsp;<span className="text-fg">FILMES</span>
      </span>
    );
  }

  return (
    <span
      className={`${SIZES[size]} relative inline-block shrink-0 overflow-hidden rounded-lg ring-1 ring-line`}
    >
      <Image
        src="/logo.jpg"
        alt="LEP Filmes"
        fill
        sizes={size === "sm" ? "60px" : "120px"}
        priority
        onError={() => setFailed(true)}
        className="scale-[1.45] object-cover"
      />
    </span>
  );
}
