/**
 * Elegibilidade da LEP (terceiro eixo da taxonomia — ver docs/diretrizes-lep.md):
 *
 *   situação   (status)             aberto, encerrado…      → o edital em si
 *   triagem    (review_status)      pendente, validado, descartado → decisão da equipe
 *   elegibilidade (eligibility_status)                      → a LEP pode ser a proponente?
 *
 * Regras determinísticas e conservadoras: incerteza vira "não confirmada" ou
 * "necessita revisão", NUNCA "não elegível". "Não elegível" só por decisão humana.
 * Restrições ficam visíveis com motivo e trecho (evidência); nada é descartado
 * automaticamente por elas.
 */
import {
  assessTerritory,
  LEP_HEADQUARTERS,
  normalize,
  territoryLabel,
  type Proponent,
  type Territory,
} from "./territory";

export const ELIGIBILITY_STATUSES = [
  "eligible",
  "not_eligible",
  "not_confirmed",
  "territorial_restriction",
  "via_partner",
  "individual",
  "needs_review",
] as const;

export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  eligible: "Elegível",
  not_eligible: "Não elegível",
  not_confirmed: "Não confirmada",
  territorial_restriction: "Restrição territorial",
  via_partner: "Via parceiro",
  individual: "Pessoa física",
  needs_review: "Necessita revisão",
};

export const ELIGIBILITY_DESCRIPTIONS: Record<EligibilityStatus, string> = {
  eligible:
    "As regras encontraram evidência de que a LEP pode ser a proponente. Demais requisitos são conferidos na revisão.",
  not_eligible: "Decisão da equipe: a LEP não pode participar.",
  not_confirmed:
    "O texto não permite confirmar a elegibilidade da LEP. Consulte o documento oficial.",
  territorial_restriction:
    "Exclusivo para proponentes de outro território (motivo e trecho abaixo).",
  via_partner:
    "A LEP não pode ser a proponente, mas há parceria configurada no território exigido. A parceira seria a proponente e não conta para a elegibilidade da LEP.",
  individual: "Destinado a pessoas físicas; a LEP (pessoa jurídica) não é a proponente.",
  needs_review:
    "Sinais conflitantes (ex.: edital nacional com cotas regionais). Precisa de leitura humana.",
};

/** Filtro "com restrição": não elegível para a LEP como proponente, mas ainda visível. */
export const RESTRICTED_ELIGIBILITY = new Set<EligibilityStatus>([
  "territorial_restriction",
  "via_partner",
  "individual",
  "not_eligible",
]);

export function isEligibilityStatus(value: unknown): value is EligibilityStatus {
  return typeof value === "string" && (ELIGIBILITY_STATUSES as readonly string[]).includes(value);
}

export type EligibilityAssessment = {
  status: EligibilityStatus;
  reason: string;
  /** Trecho do texto que motivou a conclusão. */
  evidence: string | null;
  /** Territórios identificados (mesmo formato de core.editais.eligible_territories). */
  territories: Territory[];
};

export type EligibilityOptions = {
  proponent?: Proponent;
  /**
   * Territórios onde a LEP tem parceira local configurada (futuro; hoje vazio).
   * Não tornam a LEP elegível — só classificam como "via parceiro".
   */
  partnerTerritories?: Territory[];
};

/** Pessoa física como proponente, sem abrir para pessoa jurídica. */
const INDIVIDUAL =
  /(proponentes?|inscri\w+|participar|participacao|destinad[ao]s?|aberto|abertas?|voltad[ao]s?|exclusiv\w+|somente|apenas)[^.;]{0,80}pessoas? fisicas?/;
const LEGAL_ENTITY = /pessoas? juridicas?|\bcnpj\b|produtoras?|empresas?|\bmei\b|microempreendedor/;

function coveredByPartner(territory: Territory, partners: Territory[]): boolean {
  return partners.some(
    (partner) =>
      territory === partner || (territory.startsWith(`${partner}:`) && !partner.includes(":")),
  );
}

export function assessEligibility(
  text: string,
  { proponent = LEP_HEADQUARTERS, partnerTerritories = [] }: EligibilityOptions = {},
): EligibilityAssessment {
  const normalized = normalize(text).replace(/\s+/g, " ");

  const individual = normalized.match(INDIVIDUAL);
  if (individual && !LEGAL_ENTITY.test(normalized)) {
    return {
      status: "individual",
      reason: "Destinado a pessoas físicas; a LEP Filmes é pessoa jurídica.",
      evidence: individual[0],
      territories: [],
    };
  }

  const territory = assessTerritory(text, proponent);
  if (territory.verdict === "ineligible") {
    const partner = territory.territories.find((code) =>
      coveredByPartner(code, partnerTerritories),
    );
    if (partner) {
      return {
        status: "via_partner",
        reason: `${territory.reason} Há parceria configurada em ${territoryLabel(partner)}: a parceira seria a proponente (não conta para a elegibilidade da LEP).`,
        evidence: territory.evidence,
        territories: territory.territories,
      };
    }
    return {
      status: "territorial_restriction",
      reason: territory.reason,
      evidence: territory.evidence,
      territories: territory.territories,
    };
  }
  if (territory.verdict === "eligible") {
    // Nacional com menções a outros territórios (cotas regionais): ler antes de concluir.
    const conflicting = territory.territories.includes("BR") && territory.territories.length > 1;
    return {
      status: conflicting ? "needs_review" : "eligible",
      reason: conflicting
        ? `${territory.reason}`
        : `${territory.reason} Demais requisitos do edital devem ser conferidos na revisão.`,
      evidence: territory.evidence,
      territories: territory.territories,
    };
  }
  return {
    status: "not_confirmed",
    reason: territory.reason,
    evidence: null,
    territories: [],
  };
}
