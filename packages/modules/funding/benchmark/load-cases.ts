import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { benchmarkCaseSchema, type BenchmarkCase } from "./case-schema";

/** Lê e valida todos os casos *.json das pastas indicadas (ordem alfabética). */
export function loadCases(dirs: string[]): { cases: BenchmarkCase[]; errors: string[] } {
  const cases: BenchmarkCase[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()) {
      const path = join(dir, file);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        errors.push(`${file}: JSON inválido`);
        continue;
      }
      for (const [index, entry] of (Array.isArray(raw) ? raw : [raw]).entries()) {
        const parsed = benchmarkCaseSchema.safeParse(entry);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          errors.push(`${file}[${index}]: ${issue?.path.join(".") || "caso"} — ${issue?.message}`);
          continue;
        }
        if (seen.has(parsed.data.id)) {
          errors.push(`${file}[${index}]: id repetido "${parsed.data.id}"`);
          continue;
        }
        seen.add(parsed.data.id);
        cases.push(parsed.data);
      }
    }
  }
  return { cases, errors };
}
