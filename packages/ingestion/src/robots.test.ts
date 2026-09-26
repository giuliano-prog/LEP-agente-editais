import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobots } from "./robots";

const robots = `
# comentário
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /*.pdf$

User-agent: BadBot
Disallow: /
`;

describe("robots.txt", () => {
  const rules = parseRobots(robots);

  it("respeita Disallow do grupo geral", () => {
    expect(isAllowedByRobots(rules, "/editais/edital-7/")).toBe(true);
    expect(isAllowedByRobots(rules, "/wp-admin/options.php")).toBe(false);
    expect(isAllowedByRobots(rules, "/arquivos/edital.pdf")).toBe(false);
  });

  it("regra mais específica prevalece (Allow)", () => {
    expect(isAllowedByRobots(rules, "/wp-admin/admin-ajax.php")).toBe(true);
  });

  it("não herda regras de outros robôs", () => {
    expect(isAllowedByRobots(rules, "/")).toBe(true);
  });

  it("usa o grupo específico quando existe", () => {
    const specific = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: LEP-Plataforma\nDisallow: /privado",
    );
    expect(isAllowedByRobots(specific, "/editais")).toBe(true);
    expect(isAllowedByRobots(specific, "/privado/x")).toBe(false);
  });

  it("sem regras, tudo é permitido", () => {
    expect(isAllowedByRobots(parseRobots(""), "/qualquer")).toBe(true);
  });
});
