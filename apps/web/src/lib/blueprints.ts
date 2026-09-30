/**
 * Plantas (arquitetura futura) dos módulos Produções, Produções Atuais, Orçamentos e
 * Equipe Audiovisual. SOMENTE estrutura: nomes de áreas, etapas e campos — nenhum dado
 * real ou fictício, nenhuma tabela. Quando um módulo for construído, estes rótulos viram o
 * vocabulário inicial (e as CHECK constraints da migração correspondente).
 */

export type BlueprintArea = { key: string; label: string; description: string };

/** Áreas de uma Produção (cada uma vira uma aba/seção da ficha da produção). */
export const PRODUCTION_AREAS: BlueprintArea[] = [
  {
    key: "overview",
    label: "Visão Geral",
    description: "Resumo da produção: formato, etapa, prazos e responsáveis.",
  },
  {
    key: "budget",
    label: "Orçamento",
    description: "Orçamento da produção por etapa e rubrica. Sempre pertence a uma produção.",
  },
  {
    key: "team",
    label: "Equipe",
    description: "Profissionais da Equipe Audiovisual escalados, com função e período.",
  },
  {
    key: "schedule",
    label: "Cronograma",
    description: "Etapas, diárias e marcos de pré-produção, filmagem e pós.",
  },
  {
    key: "suppliers",
    label: "Fornecedores",
    description: "Locações, equipamentos, serviços e demais fornecedores.",
  },
  {
    key: "documents",
    label: "Documentos e Arquivos",
    description: "Roteiros, versões, anexos e materiais da produção.",
  },
  {
    key: "contracts",
    label: "Contratos",
    description: "Contratos com equipe, elenco, fornecedores e parceiros.",
  },
  {
    key: "rights",
    label: "Direitos e Autorizações",
    description: "Cessões de direitos, autorizações de imagem, música e locação.",
  },
  {
    key: "finance",
    label: "Financeiro / Prestação de Contas",
    description: "Execução do orçamento, pagamentos e prestação de contas.",
  },
  {
    key: "history",
    label: "Histórico",
    description: "Registro das mudanças de etapa e decisões da produção.",
  },
];

/**
 * Ciclo de vida de uma Produção. A produção MUDA de estado — não é copiada: uma produção
 * finalizada continua sendo o mesmo registro, com todo o histórico.
 */
export const PRODUCTION_LIFECYCLE: BlueprintArea[] = [
  { key: "budgeting", label: "Em orçamento", description: "Orçamento e viabilidade em estudo." },
  { key: "approved", label: "Aprovada", description: "Recursos ou decisão de seguir confirmados." },
  {
    key: "in_production",
    label: "Em produção",
    description: "Aparece em Produções Atuais (acompanhamento do dia a dia).",
  },
  { key: "finished", label: "Finalizada", description: "Entregue; prestação de contas concluída." },
  { key: "archived", label: "Arquivada", description: "Consulta e histórico; fora da operação." },
];

/** Estados que colocam a produção em "Produções Atuais". */
export const CURRENT_PRODUCTION_STATES = ["approved", "in_production"] as const;

/** Blocos previstos para o orçamento de uma produção. */
export const BUDGET_SECTIONS: BlueprintArea[] = [
  {
    key: "development",
    label: "Desenvolvimento",
    description: "Roteiro, pesquisa e preparação.",
  },
  { key: "pre", label: "Pré-produção", description: "Equipe, testes, locações e planejamento." },
  {
    key: "shoot",
    label: "Produção / Filmagem",
    description: "Diárias, equipe, elenco e logística.",
  },
  { key: "post", label: "Pós-produção", description: "Montagem, som, cor e finalização." },
  {
    key: "admin",
    label: "Despesas administrativas",
    description: "Custos de gestão, contabilidade e taxas.",
  },
  {
    key: "distribution",
    label: "Distribuição e lançamento",
    description: "Cópias, festivais, divulgação.",
  },
];

/** Funções da Equipe Audiovisual (vocabulário inicial do banco de profissionais). */
export const AUDIOVISUAL_FUNCTIONS: string[] = [
  "Direção",
  "Assistente de Direção",
  "Roteiro",
  "Produção Executiva",
  "Direção de Produção",
  "Produção",
  "Assistente de Produção",
  "Assistente de Platô",
  "Direção de Fotografia",
  "Câmera",
  "Assistente de Câmera",
  "Elétrica / Gaffer",
  "Maquinaria",
  "Som Direto",
  "Direção de Arte",
  "Figurino",
  "Maquiagem",
  "Continuidade",
  "Casting",
  "Fotografia Still",
  "Making of",
  "Montagem / Edição",
  "Finalização / Cor",
  "Desenho de Som / Mixagem",
];

/** Ficha do profissional: só os NOMES dos campos previstos, agrupados. */
export const TEAM_PROFILE_SECTIONS: { title: string; fields: string[] }[] = [
  {
    title: "Identificação",
    fields: ["Foto", "Nome", "Função principal", "Contato"],
  },
  {
    title: "Profissional",
    fields: ["Outras funções", "Experiência", "Portfólio", "Currículo", "Cachê de referência"],
  },
  {
    title: "Relacionamento LEP",
    fields: ["Produções com a LEP", "Disponibilidade", "Observações internas"],
  },
];

/** Fluxo previsto para a Equipe Audiovisual. */
export const TEAM_FUTURE_FLOW: string[] = [
  "Cadastrar o profissional no banco (não é usuário da plataforma).",
  "Classificar por função e registrar disponibilidade.",
  "Escalar o profissional na área Equipe de uma Produção.",
  "Ligar contratos, cachês e documentos à produção em que atuou.",
  "Manter o histórico de produções com a LEP.",
];
