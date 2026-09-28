import { describe, expect, it } from "vitest";
import {
  canonicalKey,
  compareFingerprints,
  editalNumber,
  findDuplicateEdital,
  fingerprint,
  titleTokens,
} from "./dedup";

describe("editalNumber / titleTokens", () => {
  it.each([
    ["Edital nº 5/2026 — Produção de Longas", "5/2026"],
    ["EDITAL N.º 05/2026", "5/2026"],
    ["Chamada Pública 03-2026 Curtas", "3/2026"],
    ["Prêmio de Roteiro nº 12/26", "12/2026"],
    ["Edital de Produção de Longas 2026", null],
  ])("%s → %s", (title, number) => {
    expect(editalNumber(title)).toBe(number);
  });

  it("palavras significativas, sem acentos, sem termos genéricos", () => {
    expect(titleTokens("Edital de Produção de Longas-Metragens de Ficção 2026")).toEqual([
      "ficcao",
      "longas",
      "metragens",
      "producao",
    ]);
  });
});

describe("compareFingerprints", () => {
  const orgao = fingerprint({
    title: "Edital nº 5/2026 — Produção de Longas-Metragens",
    deadline: "2026-11-30",
  });

  it("mesmo número + títulos parecidos (fonte oficial × agregador) → mesmo edital", () => {
    const prosas = fingerprint({ title: "Spcine - Edital 5/2026 - Produção de longas-metragens" });
    expect(compareFingerprints(prosas, orgao)).toMatchObject({ verdict: "same" });
  });

  it("número vindo do texto da página", () => {
    const page = fingerprint({
      title: "Produção de Longas-Metragens",
      text: "EDITAL Nº 5/2026. Inscrições até 30/11/2026.",
    });
    expect(page.number).toBe("5/2026");
    expect(compareFingerprints(page, orgao).verdict).toBe("same");
  });

  it("números diferentes → editais diferentes, mesmo com título igual", () => {
    const outro = fingerprint({ title: "Edital nº 6/2026 — Produção de Longas-Metragens" });
    expect(compareFingerprints(outro, orgao)).toMatchObject({ verdict: "different" });
  });

  it("sem número: título quase igual + mesmo prazo → mesmo; sem prazo → só possível", () => {
    const a = fingerprint({
      title: "Prêmio de Desenvolvimento de Séries de Animação",
      deadline: "2026-10-10",
    });
    const b = fingerprint({
      title: "Premio Desenvolvimento Series Animação",
      deadline: "2026-10-10",
    });
    expect(compareFingerprints(a, b).verdict).toBe("same");
    const semPrazo = fingerprint({ title: "Premio Desenvolvimento Series Animação" });
    expect(compareFingerprints(a, semPrazo).verdict).toBe("possible");
  });

  it("prazos diferentes com títulos só parecidos → diferentes (ex.: edições anuais)", () => {
    const a = fingerprint({ title: "Laboratório de Roteiro de Séries", deadline: "2025-10-10" });
    const b = fingerprint({
      title: "Laboratório de Roteiro de Séries Documentais",
      deadline: "2026-10-10",
    });
    expect(compareFingerprints(a, b).verdict).toBe("different");
  });
});

describe("findDuplicateEdital / canonicalKey", () => {
  it("prefere 'mesmo' a 'possível'", () => {
    const candidate = fingerprint({ title: "Edital 5/2026 Produção de Longas" });
    const match = findDuplicateEdital(candidate, [
      {
        id: "a",
        title: "Produção de Longas e Curtas",
        print: fingerprint({ title: "Produção de Longas e Curtas" }),
      },
      {
        id: "b",
        title: "Edital nº 5/2026 Longas",
        print: fingerprint({ title: "Edital nº 5/2026 Produção de Longas" }),
      },
    ]);
    expect(match).toMatchObject({ id: "b", verdict: "same" });
    expect(findDuplicateEdital(fingerprint({ title: "Mostra de Cinema Indígena" }), [])).toBeNull();
  });

  it("chave canônica: número/ano ou palavras do título", () => {
    expect(canonicalKey(fingerprint({ title: "Edital 5/2026 Longas" }))).toBe("n:5/2026");
    expect(canonicalKey(fingerprint({ title: "Prêmio de Roteiro de Longas" }))).toBe(
      "t:longas-roteiro",
    );
    expect(canonicalKey(fingerprint({ title: "Edital" }))).toBeNull();
  });
});
