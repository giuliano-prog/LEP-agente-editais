/**
 * Benchmark de editais: compara o que o motor atual responde com o que uma pessoa
 * conferiu em cada caso. Não altera nada e não usa rede nem banco.
 *
 *   pnpm benchmark:editais [--cases <pasta>] [--json <arquivo>] [--min-accuracy 0.8]
 *
 * Pastas lidas: benchmark/cases (exemplos fictícios, versionados) + benchmark/private
 * (casos reais, fora do Git) + --cases / BENCHMARK_CASES_DIR.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildReport, evaluateCase } from "./evaluate";
import { loadCases } from "./load-cases";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    cases: { type: "string" },
    json: { type: "string" },
    "min-accuracy": { type: "string" },
  },
});

const dirs = [join(here, "cases"), join(here, "private")];
const extra = args.cases ?? process.env.BENCHMARK_CASES_DIR;
if (extra) dirs.push(resolve(process.env.INIT_CWD ?? process.cwd(), extra));

const { cases, errors } = loadCases(dirs);
for (const error of errors) console.error(`✕ ${error}`);
if (errors.length > 0) process.exit(1);

const outcomes = cases.flatMap((item) => evaluateCase(item));
const report = buildReport(cases, outcomes);

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
console.log(`Benchmark de editais — ${report.cases} caso(s), ${report.realCases} real(is)\n`);
if (report.realCases === 0) {
  console.log(
    "⚠ Nenhum caso real carregado. A lista de 38 oportunidades (planilha de 26/09/2026) ainda não foi\n" +
      "  entregue: coloque os casos em benchmark/private/ (fora do Git) ou use --cases. Ver README.\n",
  );
}
console.table(
  report.fields.map((stats) => ({
    campo: stats.field,
    avaliados: stats.evaluated,
    acertos: stats.hits,
    erros: stats.misses,
    "erros graves": stats.critical,
    "sem avaliador": stats.noEvaluator,
    acurácia: pct(stats.accuracy),
  })),
);
for (const failure of report.failures) {
  console.log(
    `${failure.critical ? "✕✕" : "✕ "} ${failure.caseId} · ${failure.field}: esperado ${JSON.stringify(failure.expected)}, motor ${JSON.stringify(failure.actual)}`,
  );
}

if (args.json) {
  writeFileSync(
    resolve(process.env.INIT_CWD ?? process.cwd(), args.json),
    JSON.stringify(report, null, 2),
  );
  console.log(`\nRelatório JSON: ${args.json}`);
}

const minimum = args["min-accuracy"] ? Number(args["min-accuracy"]) : null;
if (minimum !== null) {
  const below = report.fields.filter(
    (stats) => stats.accuracy !== null && stats.accuracy < minimum,
  );
  const critical = report.fields.reduce((total, stats) => total + stats.critical, 0);
  if (below.length > 0 || critical > 0) {
    console.error(
      `\n✕ Abaixo do mínimo (${pct(minimum)}): ${below.map((s) => s.field).join(", ") || "—"}; erros graves: ${critical}`,
    );
    process.exit(1);
  }
}
