import { describe, expect, it } from "vitest";
import { mediaForProduction, normalizeTitle, youtubeUrls } from "./media";
import {
  CURRENT_STAGES,
  PRODUCTION_AREAS,
  PRODUCTION_LIFECYCLE,
  isCurrentStage,
  productionArea,
} from "./model";

describe("modelo da produção", () => {
  it("uma ficha com as 10 áreas, na ordem", () => {
    expect(PRODUCTION_AREAS.map((area) => area.label)).toEqual([
      "Visão Geral",
      "Orçamento",
      "Equipe",
      "Cronograma",
      "Fornecedores",
      "Documentos e Arquivos",
      "Contratos",
      "Direitos e Autorizações",
      "Financeiro / Prestação de Contas",
      "Histórico",
    ]);
    expect(productionArea("contratos").label).toBe("Contratos");
    expect(productionArea("inexistente").key).toBe("visao-geral");
    expect(productionArea(undefined).key).toBe("visao-geral");
  });

  it("atuais × concluídas = estados da mesma entidade", () => {
    expect(PRODUCTION_LIFECYCLE.map((step) => step.label)).toEqual([
      "Em orçamento",
      "Aprovada",
      "Em produção",
      "Finalizada",
      "Arquivada",
    ]);
    expect(CURRENT_STAGES).toEqual(["budgeting", "approved", "in_production"]);
    expect(isCurrentStage("in_production")).toBe(true);
    expect(isCurrentStage("finished")).toBe(false);
  });

  it("trailer de A Conspiração Condor por título (acentos/artigo não importam)", () => {
    expect(normalizeTitle("A Conspiração  Condor!")).toBe("a conspiracao condor");
    expect(mediaForProduction("A Conspiração Condor")?.youtubeId).toBe("TJXg83kcFMA");
    expect(mediaForProduction("Conspiração Condor")?.youtubeId).toBe("TJXg83kcFMA");
    expect(mediaForProduction("Outra produção")).toBeNull();
    expect(youtubeUrls("TJXg83kcFMA")).toEqual({
      embed: "https://www.youtube-nocookie.com/embed/TJXg83kcFMA?rel=0",
      watch: "https://www.youtube.com/watch?v=TJXg83kcFMA",
    });
  });
});
