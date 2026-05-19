import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { runBatchSimulations, type BatchOptions } from "../src/sim/batch.ts";
import { DEFAULT_SIMULATION_PARAMETERS, mergeParameters, sanitizeParameters } from "../src/sim/parameters.ts";
import type { SimulationParameters } from "../src/sim/types.ts";

type CliOptions = BatchOptions & {
  out: string;
  parametersPath?: string;
};

const options = parseArgs(process.argv.slice(2));
const parameters = loadParameters(options.parametersPath);
const summary = runBatchSimulations(options, parameters);

mkdirSync(path.dirname(options.out), { recursive: true });
writeFileSync(options.out, `${JSON.stringify(summary, null, 2)}\n`);

process.stdout.write(
  [
    `Wrote ${summary.runs.length} run${summary.runs.length === 1 ? "" : "s"} to ${options.out}`,
    `Average population: ${summary.aggregate.averagePopulation}`,
    `Average surviving lineages: ${summary.aggregate.averageSurvivingLineages}`,
    `Extinction rate: ${summary.aggregate.extinctionRate}`,
  ].join("\n") + "\n",
);

function parseArgs(argv: string[]): CliOptions {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options: CliOptions = {
    runs: 10,
    stopTick: 1000,
    seed: DEFAULT_SIMULATION_PARAMETERS.runtime.initialSeed,
    out: `data/batch-${timestamp}.json`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else if (arg === "--runs") {
      options.runs = positiveInteger(readRequiredValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--ticks" || arg === "--stop-tick" || arg === "--stopTick") {
      options.stopTick = positiveInteger(readRequiredValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--seed") {
      options.seed = integer(readRequiredValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--out") {
      options.out = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--parameters") {
      options.parametersPath = readRequiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--quiet") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelpAndExit(): never {
  process.stdout.write(`Usage: npm run sim:batch -- [options]

Options:
  --runs <number>         Number of independent simulations. Default: 10
  --ticks <number>        Stop tick for every simulation. Default: 1000
  --seed <number>         Base seed; run N uses seed + N. Default: runtime.initialSeed
  --out <path>            JSON output path. Default: data/batch-<timestamp>.json
  --parameters <path>     Optional JSON parameter override, merged with defaults
`);
  process.exit(0);
}

function loadParameters(parametersPath: string | undefined): SimulationParameters {
  if (!parametersPath) return sanitizeParameters(DEFAULT_SIMULATION_PARAMETERS);
  const raw = readFileSync(parametersPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SimulationParameters>;
  return sanitizeParameters(mergeParameters(DEFAULT_SIMULATION_PARAMETERS, parsed));
}

function readRequiredValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${arg} requires a value`);
  return value;
}

function positiveInteger(value: string, label: string) {
  const parsed = integer(value, label);
  if (parsed < 1) throw new Error(`${label} must be at least 1`);
  return parsed;
}

function integer(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}
