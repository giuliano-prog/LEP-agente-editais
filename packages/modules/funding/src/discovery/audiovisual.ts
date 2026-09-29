/**
 * Relevância audiovisual de uma oportunidade (descoberta web, ADR-0024) — sem IA.
 *
 * TEMA ≠ OBJETO. O tema é o assunto da obra (esporte, saúde, educação, meio
 * ambiente…) e NUNCA exclui uma oportunidade. O que decide é o OBJETO: o que o
 * edital financia, seleciona, apoia ou premia.
 *
 *   tema esporte   + objeto "produção de documentário"      → SIM
 *   tema educação  + objeto "curso presencial" (sem obra)    → NÃO
 *   teatro com "registro audiovisual" como contrapartida     → NÃO (audiovisual complementar)
 *   programa cultural amplo com linha de curta-metragem      → SIM (pela linha)
 *
 * A palavra "audiovisual" sozinha não basta: é preciso um produto/projeto
 * audiovisual como objeto (produção, desenvolvimento, finalização, distribuição,
 * exibição… de filme, série, documentário, animação, obra audiovisual…).
 * Na dúvida, "incerta" — nunca vira "sim" nem é descartada sem motivo registrado.
 */
import { normalize } from "../territory";

export type AudiovisualRelevance = "yes" | "no" | "uncertain";

export const AUDIOVISUAL_RELEVANCE_LABELS: Record<AudiovisualRelevance, string> = {
  yes: "Audiovisual",
  no: "Não audiovisual",
  uncertain: "Audiovisual incerto",
};

export type AudiovisualAssessment = {
  relevance: AudiovisualRelevance;
  /** Justificativa em pt-BR (a primeira é a principal). */
  reasons: string[];
  /** Trecho literal que fundamenta a decisão, quando houver. */
  evidence: { quote: string; source: "title" | "text" } | null;
  /** Temas reconhecidos (informativos: tema nunca exclui). */
  themes: string[];
};

/** Produtos/projetos audiovisuais (texto já normalizado: sem acentos, minúsculo). */
const PRODUCT =
  "(?:obras? audiovisua(?:l|is)|conteudos? audiovisua(?:l|is)|projetos? (?:de )?audiovisua(?:l|is)|" +
  "projetos? cinematografic\\w*|producoes? audiovisua(?:l|is)|obras? cinematografic\\w*|" +
  "obras? (?:documenta\\w*|de ficcao|de animacao)|filmes?|longas?[- ]?metrage(?:m|ns)|curtas?[- ]?metrage(?:m|ns)|" +
  "medias?[- ]?metrage(?:m|ns)|documentarios?|webseries?|web series?|telefilmes?|" +
  "series?(?! (?:iniciais|finais|historicas?))|animac(?:ao|oes)|videoclipes?|" +
  "videos? (?:educativ\\w*|educaciona\\w*|documenta\\w*)|cinema|audiovisual)";

/** Ações de financiamento/realização sobre o produto (o OBJETO). */
const ACTION =
  "(?:producao|produzir|realizacao|realizar|desenvolvimento|desenvolver|finalizacao|finalizar|" +
  "pos[- ]producao|distribuicao|distribuir|lancamento|lancar|comercializacao|circulacao|exibicao|" +
  "exibir|difusao|coproducao|co-producao|roteiros?|escrita)";

/** Apoio/seleção cujo objeto é o produto (linhas, categorias, prêmios). */
const SUPPORT =
  "(?:apoio|apoiar|fomento|fomentar|incentivo|financiamento|financiar|investimento|patrocinio|" +
  "premi\\w+|selecao|selecionar|selecionados?|contemplar|contemplados?|linha|categoria|modalidade|" +
  "chamada|laboratorio|residencia)";

/** Para o TÍTULO: sem palavras ambíguas sozinhas ("série", "animação"). */
const TITLE_PRODUCT = new RegExp(
  "\\b(?:audiovisua(?:l|is)|cinema|cinematografic\\w*|filmes?|longas?[- ]?metrage(?:m|ns)|" +
    "curtas?[- ]?metrage(?:m|ns)|medias?[- ]?metrage(?:m|ns)|documentarios?|webseries?|telefilmes?|" +
    "series? (?:documenta\\w*|de ficcao|de animacao|audiovisua\\w*|televisiva\\w*|de tv)|" +
    "filmes? de animacao|roteiros? (?:de|para) (?:cinema|filme|longa|curta|serie))\\b",
);

const GAP = "(?:\\s+\\S+){0,5}?\\s+";
const OBJECT_PATTERNS = [
  new RegExp(`\\b${ACTION}${GAP}${PRODUCT}\\b`),
  new RegExp(`\\b${SUPPORT}${GAP}${PRODUCT}\\b`),
  /\b(?:fomento|apoio|incentivo|investimento) (?:ao|a|para o) (?:setor )?(?:audiovisual|cinema)\b/,
];

/** Audiovisual como atividade acessória (registro, divulgação, contrapartida). */
const COMPLEMENTARY =
  /\b(registros? (?:audiovisua\w*|em video|fotografic\w*)|documentacao (?:audiovisual|em video)|videos? (?:de|para) divulgacao|(?:material|conteudo|pecas?) (?:audiovisua\w* )?(?:de|para) divulgacao|teaser|making of|transmiss(?:ao|oes) (?:ao vivo|online|do espetaculo)|gravacao do (?:espetaculo|show|evento)|atividades? complementar\w*|contrapartidas?|acessibilidade (?:audiovisual|comunicacional))\b/;

/** Objetos claramente de outra natureza (teatro, dança, esporte, livro…). */
const NON_AV_OBJECTS: { pattern: RegExp; label: string }[] = [
  {
    pattern:
      /\b(?:montagem|circulacao|temporada|producao|realizacao|apresentac\w+|encenacao)(?: (?:de|do|da|dos|das))?(?: \S+){0,3}? (?:espetaculos?|pecas? teatra\w*|pecas? de teatro|teatro|teatra\w*|danca|coreografi\w+|shows?|concertos?|opera|circo|performances?)\b/,
    label: "artes cênicas/música ao vivo",
  },
  {
    pattern:
      /\b(?:campeonatos?|torneios?|competic(?:ao|oes) esportiv\w*|eventos? esportiv\w*|jogos esportiv\w*|olimpiadas? escolares|praticas? esportiv\w*)\b/,
    label: "evento/prática esportiva",
  },
  {
    pattern: /\b(?:publicacao|edicao|impressao) de (?:livros?|obras? literari\w+|revistas?)\b/,
    label: "publicação literária",
  },
  {
    pattern:
      /\b(?:exposic(?:ao|oes) (?:de )?(?:artes? visua\w+|fotografi\w+|artistic\w+)|exposic(?:ao|oes)\b)/,
    label: "exposição",
  },
  {
    pattern:
      /\b(?:cursos?|capacitac(?:ao|oes)|oficinas?|formac(?:ao|oes)) (?:presencia\w+|de professores|de gestores|de docentes)\b/,
    label: "formação sem produção de obra",
  },
  {
    pattern: /\bgravacao (?:de|do|da) (?:album|disco|ep|single|cd)\b/,
    label: "gravação musical",
  },
];

/** Qualquer menção a audiovisual (sinal fraco: só leva a "incerta"). */
const WEAK_AV =
  /\b(audiovisua\w*|cinema\w*|cinematografic\w*|filmes?|longa[- ]?metragem|curta[- ]?metragem|documentarios?)\b/;

const THEMES: [string, RegExp][] = [
  ["esporte", /\b(esport\w*|futebol|atletas?|olimpi\w+|paralimpi\w+)\b/],
  ["saúde", /\b(saude|sus\b|doencas?|hospita\w+)\b/],
  ["educação", /\b(educac\w+|educativ\w+|escolas?|ensino)\b/],
  [
    "meio ambiente",
    /\b(meio ambiente|ambienta\w+|sustentab\w+|clima\w*|amazonia|biodiversidade)\b/,
  ],
  ["história e patrimônio", /\b(historia|historic\w+|memoria|patrimonio)\b/],
  ["ciência e tecnologia", /\b(ciencia\w*|cientific\w+|tecnolog\w+|inovac\w+)\b/],
  ["direitos humanos", /\b(direitos humanos|diversidade|equidade|inclusao|antirracis\w+)\b/],
  ["turismo", /\b(turismo|turistic\w+)\b/],
  ["música", /\b(musica|musica\w+)\b/],
  ["infância e juventude", /\b(infan\w+|criancas?|juventude|jovens)\b/],
];

/** Divide o texto em frases/linhas (mantém o original para citar como evidência). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+|\s[•·▪]\s/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 12);
}

const quoteOf = (sentence: string) =>
  sentence.length > 300 ? `${sentence.slice(0, 297)}…` : sentence;

const matchesObject = (normalized: string) =>
  OBJECT_PATTERNS.some((pattern) => pattern.test(normalized));

export function classifyAudiovisualRelevance(input: {
  title: string;
  text?: string | null;
}): AudiovisualAssessment {
  const title = input.title.trim();
  const titleNorm = normalize(title);
  const all = sentences(input.text ?? "");
  const normalized = all.map((sentence) => normalize(sentence));
  const whole = `${titleNorm} ${normalized.join(" ")}`;
  const themes = THEMES.filter(([, pattern]) => pattern.test(whole)).map(([name]) => name);
  const themeNote =
    themes.length > 0 ? [`tema: ${themes.join(", ")} (o tema não exclui; decide o objeto)`] : [];

  // 1) Objeto audiovisual explícito numa frase que não seja só complementar.
  const objectIndex = normalized.findIndex(
    (sentence) => matchesObject(sentence) && !COMPLEMENTARY.test(sentence),
  );
  if (objectIndex >= 0) {
    return {
      relevance: "yes",
      reasons: ["o objeto inclui produto/projeto audiovisual", ...themeNote],
      evidence: { quote: quoteOf(all[objectIndex]!), source: "text" },
      themes,
    };
  }

  const nonAv = normalized
    .map((sentence, index) => ({
      index,
      hit: NON_AV_OBJECTS.find((o) => o.pattern.test(sentence)),
    }))
    .find((item) => item.hit);
  const titleNonAv = NON_AV_OBJECTS.find((o) => o.pattern.test(titleNorm));
  const titleHasObject = matchesObject(titleNorm) && !COMPLEMENTARY.test(titleNorm);

  // 2) Título com produto audiovisual (ex.: "Edital de Curtas-Metragens 2026").
  if (titleHasObject || (TITLE_PRODUCT.test(titleNorm) && !COMPLEMENTARY.test(titleNorm))) {
    if (!nonAv && !titleNonAv) {
      return {
        relevance: "yes",
        reasons: ["o título indica produto/projeto audiovisual", ...themeNote],
        evidence: { quote: quoteOf(title), source: "title" },
        themes,
      };
    }
    return {
      relevance: "uncertain",
      reasons: [
        `o título cita audiovisual, mas o texto descreve outro objeto (${(nonAv?.hit ?? titleNonAv)!.label})`,
        ...themeNote,
      ],
      evidence: nonAv
        ? { quote: quoteOf(all[nonAv.index]!), source: "text" }
        : { quote: quoteOf(title), source: "title" },
      themes,
    };
  }

  // 3) Objeto de outra natureza (teatro, esporte, livro…) sem produto audiovisual.
  if (nonAv || titleNonAv) {
    const label = (nonAv?.hit ?? titleNonAv)!.label;
    return {
      relevance: "no",
      reasons: [`objeto é ${label}; audiovisual não integra os produtos elegíveis`, ...themeNote],
      evidence: nonAv
        ? { quote: quoteOf(all[nonAv.index]!), source: "text" }
        : { quote: quoteOf(title), source: "title" },
      themes,
    };
  }

  // 4) Audiovisual só como atividade complementar (registro, divulgação, contrapartida).
  const complementary = normalized.findIndex(
    (sentence) => COMPLEMENTARY.test(sentence) && WEAK_AV.test(sentence),
  );
  if (complementary >= 0 || (COMPLEMENTARY.test(titleNorm) && WEAK_AV.test(titleNorm))) {
    return {
      relevance: "no",
      reasons: [
        "audiovisual aparece só como atividade complementar, não como objeto",
        ...themeNote,
      ],
      evidence:
        complementary >= 0
          ? { quote: quoteOf(all[complementary]!), source: "text" }
          : { quote: quoteOf(title), source: "title" },
      themes,
    };
  }

  // 5) Menção vaga: não dá para confirmar se é objeto financiável.
  const weak = normalized.findIndex((sentence) => WEAK_AV.test(sentence));
  if (weak >= 0 || WEAK_AV.test(titleNorm)) {
    return {
      relevance: "uncertain",
      reasons: [
        "menciona audiovisual, mas não foi possível confirmar se é objeto financiável",
        ...themeNote,
      ],
      evidence:
        weak >= 0
          ? { quote: quoteOf(all[weak]!), source: "text" }
          : { quote: quoteOf(title), source: "title" },
      themes,
    };
  }

  return {
    relevance: "no",
    reasons: ["nenhum produto/projeto audiovisual encontrado no título nem no texto", ...themeNote],
    evidence: null,
    themes,
  };
}
