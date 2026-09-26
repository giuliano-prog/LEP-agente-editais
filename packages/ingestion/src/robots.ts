/**
 * Leitura simples de robots.txt (RFC 9309): grupos por User-agent, regras
 * Allow/Disallow por prefixo com curingas "*" e "$". Vale a regra mais específica
 * (mais longa); em empate, Allow prevalece.
 */
export type RobotsRules = { allow: string[]; disallow: string[] };

export const ROBOTS_AGENT = "lep-plataforma";

export function parseRobots(content: string, agent = ROBOTS_AGENT): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" && value) current.allow.push(value);
    if (field === "disallow" && value) current.disallow.push(value);
  }

  const specific = groups.filter((group) =>
    group.agents.some((name) => name !== "*" && agent.includes(name)),
  );
  const chosen =
    specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));
  return {
    allow: chosen.flatMap((group) => group.allow),
    disallow: chosen.flatMap((group) => group.disallow),
  };
}

function toPattern(rule: string): RegExp {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function isAllowedByRobots(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [rules.allow, true],
    [rules.disallow, false],
  ] as const) {
    for (const rule of list) {
      if (!toPattern(rule).test(pathWithQuery)) continue;
      const length = rule.replace(/[*$]/g, "").length;
      if (!best || length > best.length || (length === best.length && allow))
        best = { length, allow };
    }
  }
  return best ? best.allow : true;
}
