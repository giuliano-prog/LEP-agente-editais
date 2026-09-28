"use client";

import Image from "next/image";
import { useState } from "react";
import { LEP_LOGO } from "@/lib/brand";

/*
 * Logomarca oficial em alta resolução (public/brand/lep-logo.png, fundo transparente).
 * Só a altura é fixada; a largura segue a proporção original (sem recorte, sem distorção).
 * `sizes` informa a largura exibida para o Next gerar versões otimizadas (inclusive 2x/3x).
 */
const SIZES = {
  sm: { className: "h-9 sm:h-11", sizes: "(min-width: 640px) 57px, 47px" },
  lg: { className: "h-20 sm:h-24", sizes: "(min-width: 640px) 123px, 103px" },
} as const;

export function Logo({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const variant = SIZES[size];

  if (failed) {
    // Se o arquivo não carregar, o nome em texto evita imagem quebrada.
    return (
      <span
        className={`${variant.className} inline-flex items-center rounded-md border border-line px-3 text-sm font-bold tracking-[0.25em]`}
      >
        <span className="text-brand">LEP</span>&nbsp;<span className="text-fg">FILMES</span>
      </span>
    );
  }

  return (
    <Image
      src={LEP_LOGO.src}
      alt={LEP_LOGO.alt}
      width={LEP_LOGO.width}
      height={LEP_LOGO.height}
      sizes={variant.sizes}
      priority
      onError={() => setFailed(true)}
      className={`${variant.className} w-auto shrink-0 select-none`}
    />
  );
}
