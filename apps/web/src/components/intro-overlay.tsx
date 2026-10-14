"use client";

import { useEffect, useRef, useState } from "react";
import {
  INTRO_COOKIE,
  INTRO_MAX_MS,
  INTRO_START_TIMEOUT_MS,
  INTRO_VIDEO_SRC,
} from "@/lib/intro/constants";

/**
 * Abertura após o login: vídeo em tela cheia (sem distorção — `object-contain`), botão
 * "Pular abertura" visível desde o início e saída automática ao terminar.
 *
 * Nunca bloqueia o acesso: começa sem som (autoplay mudo é permitido em todos os
 * navegadores), sai se o vídeo falhar, se não começar em 4 s ou após 15 s no total; e,
 * mesmo sem JavaScript, uma animação CSS esconde a camada depois de 16 s.
 */
export function IntroOverlay() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  const finish = () => setLeaving(true);

  useEffect(() => {
    // Mostra uma vez só: navegação e recarregamento não repetem a abertura.
    document.cookie = `${INTRO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    skipRef.current?.focus();
    const video = videoRef.current;
    video?.play().catch(() => setLeaving(true));
    const startTimer = window.setTimeout(() => {
      if (!video || video.currentTime === 0) setLeaving(true);
    }, INTRO_START_TIMEOUT_MS);
    const maxTimer = window.setTimeout(() => setLeaving(true), INTRO_MAX_MS);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setLeaving(true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(maxTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    videoRef.current?.pause();
    const timer = window.setTimeout(() => setVisible(false), 400);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Abertura LEP Filmes"
      className={`lep-intro fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-400 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src={INTRO_VIDEO_SRC}
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className="h-full w-full object-contain"
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            setMuted((value) => !value);
            if (video) {
              video.muted = !video.muted;
              void video.play().catch(() => {});
            }
          }}
          className="rounded-full border border-white/25 bg-black/40 px-4 py-2 text-sm text-white/80 backdrop-blur transition hover:border-white/60 hover:text-white"
        >
          {muted ? "Ativar som" : "Sem som"}
        </button>
        <button
          ref={skipRef}
          type="button"
          onClick={finish}
          className="rounded-full border border-white/40 bg-black/40 px-5 py-2 text-sm font-medium text-white backdrop-blur transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Pular abertura
        </button>
      </div>
    </div>
  );
}
