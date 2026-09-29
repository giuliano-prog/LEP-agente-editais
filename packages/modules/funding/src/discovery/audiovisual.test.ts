import { describe, expect, it } from "vitest";
import { classifyAudiovisualRelevance } from "./audiovisual";

// Textos FICTÍCIOS, escritos para os casos do plano (nenhum edital real).
describe("classifyAudiovisualRelevance — tema × objeto", () => {
  it("caso 1: documentário sobre futebol → SIM (tema esporte não exclui)", () => {
    const result = classifyAudiovisualRelevance({
      title: "Programa Memória do Esporte 2026",
      text: "O programa apoia a produção de documentários sobre atletas e a história do futebol brasileiro. Inscrições até 30/11/2026.",
    });
    expect(result.relevance).toBe("yes");
    expect(result.evidence?.quote).toContain("produção de documentários");
    expect(result.themes).toContain("esporte");
  });

  it("caso 2: filme sobre educação → SIM", () => {
    const result = classifyAudiovisualRelevance({
      title: "Chamada Educação em Foco",
      text: "Serão selecionados projetos para realização de filmes de ficção com temática educacional.",
    });
    expect(result.relevance).toBe("yes");
    expect(result.themes).toContain("educação");
  });

  it("caso 3: série sobre saúde → SIM", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital Saúde na Tela",
      text: "Objeto: desenvolvimento e produção de série documental sobre saúde pública e o SUS.",
    });
    expect(result.relevance).toBe("yes");
  });

  it("caso 4: curta sobre meio ambiente → SIM", () => {
    const result = classifyAudiovisualRelevance({
      title: "Prêmio Amazônia Viva",
      text: "Premiação de curtas-metragens sobre meio ambiente e biodiversidade.",
    });
    expect(result.relevance).toBe("yes");
    expect(result.themes).toContain("meio ambiente");
  });

  it("caso 5: teatro que cita audiovisual como atividade complementar → NÃO", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital de Artes Cênicas 2026",
      text: "O objeto é a montagem de espetáculos teatrais inéditos. Os projetos poderão prever registro audiovisual das apresentações como atividade complementar.",
    });
    expect(result.relevance).toBe("no");
    expect(result.reasons[0]).toMatch(/artes cênicas/);
  });

  it("caso 6: esporte para campeonatos → NÃO", () => {
    const result = classifyAudiovisualRelevance({
      title: "Programa de Esporte 2026",
      text: "Apoio à realização de campeonatos e torneios de futebol amador nos municípios.",
    });
    expect(result.relevance).toBe("no");
  });

  it("caso 7a: educação que financia vídeos educacionais → SIM (produto formal)", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital Escola Criativa",
      text: "Serão apoiados projetos de produção de vídeos educativos para a rede pública de ensino.",
    });
    expect(result.relevance).toBe("yes");
  });

  it("caso 7b: educação sem produção audiovisual → NÃO", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital Escola Criativa",
      text: "Apoio a cursos presenciais de formação de professores da rede pública de ensino.",
    });
    expect(result.relevance).toBe("no");
  });

  it("caso 8: programa cultural amplo com linha de cinema → SIM pela linha", () => {
    const result = classifyAudiovisualRelevance({
      title: "Programa Cultura 2026",
      text: "Linha 1: circulação de espetáculos de dança. Linha 2: publicação de livros. Linha 3: produção de curta-metragem de ficção ou documentário.",
    });
    expect(result.relevance).toBe("yes");
    expect(result.evidence?.quote).toContain("curta-metragem");
  });

  it("caso 9: programa cultural amplo sem linha audiovisual → NÃO", () => {
    const result = classifyAudiovisualRelevance({
      title: "Programa Cultura 2026",
      text: "Linha 1: circulação de espetáculos de dança. Linha 2: publicação de livros de poesia. Linha 3: exposições de artes visuais.",
    });
    expect(result.relevance).toBe("no");
  });

  it("reconhece longa/curta/média-metragem no singular e no plural", () => {
    for (const text of [
      "Produção de longa-metragem documental.",
      "Produção de longas-metragens de ficção.",
      "Finalização de média-metragem.",
      "Desenvolvimento de curtas metragens de animação.",
    ]) {
      expect(classifyAudiovisualRelevance({ title: "Programa X", text }).relevance).toBe("yes");
    }
  });

  it("palavra 'audiovisual' sozinha não basta", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital de Ocupação de Espaços",
      text: "O espaço conta com equipamento audiovisual à disposição dos grupos selecionados.",
    });
    expect(result.relevance).toBe("uncertain");
  });

  it("título de audiovisual sem texto → SIM pelo título", () => {
    const result = classifyAudiovisualRelevance({ title: "Edital de Curtas-Metragens 2026" });
    expect(result.relevance).toBe("yes");
    expect(result.evidence?.source).toBe("title");
  });

  it("título com audiovisual, mas objeto de teatro no texto → INCERTA (revisão)", () => {
    const result = classifyAudiovisualRelevance({
      title: "Edital Teatro e Audiovisual",
      text: "Apoio à montagem de espetáculos teatrais em todo o estado.",
    });
    expect(result.relevance).toBe("uncertain");
  });

  it("'séries iniciais' (educação) não é série audiovisual", () => {
    const result = classifyAudiovisualRelevance({
      title: "Programa de reforço escolar",
      text: "Apoio a projetos de desenvolvimento de leitura para as séries iniciais do ensino fundamental.",
    });
    expect(result.relevance).toBe("no");
  });

  it("sem nenhum produto audiovisual → NÃO, sem evidência", () => {
    const result = classifyAudiovisualRelevance({
      title: "Chamada para feira de artesanato",
      text: "Seleção de artesãos para a feira municipal.",
    });
    expect(result.relevance).toBe("no");
    expect(result.evidence).toBeNull();
  });
});
