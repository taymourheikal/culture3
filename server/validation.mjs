export function validateBatchSummary(summary) {
  if (!summary || typeof summary !== "object") return "Missing summary";
  if (!summary.options || typeof summary.options !== "object") return "Missing summary.options";
  if (!Number.isFinite(summary.options.runs)) return "Missing summary.options.runs";
  if (!Number.isFinite(summary.options.stopTick)) return "Missing summary.options.stopTick";
  if (!Number.isFinite(summary.options.seed)) return "Missing summary.options.seed";
  if (!summary.parameters || typeof summary.parameters !== "object") return "Missing summary.parameters";
  if (!summary.aggregate || typeof summary.aggregate !== "object") return "Missing summary.aggregate";
  if (!Array.isArray(summary.runs)) return "Missing summary.runs";
  for (const run of summary.runs) {
    if (!Number.isFinite(run.runIndex)) return "Invalid run.runIndex";
    if (!Array.isArray(run.survivingLineages)) return "Invalid run.survivingLineages";
  }
  return "";
}

export function sanitizeBatchOptions(options) {
  const runs = readIntegerOption(options?.runs ?? 1, "runs", 1);
  if (!runs.ok) return runs;
  const stopTick = readIntegerOption(options?.stopTick ?? options?.ticks ?? 1, "stopTick", 1);
  if (!stopTick.ok) return stopTick;
  const seed = readIntegerOption(options?.seed ?? 0, "seed", 0);
  if (!seed.ok) return seed;
  return {
    ok: true,
    options: {
      runs: runs.value,
      stopTick: stopTick.value,
      seed: seed.value,
    },
  };
}

export function readLimit(value) {
  const number = Number(value ?? 50);
  if (!Number.isFinite(number)) return 50;
  return Math.max(1, Math.min(200, Math.floor(number)));
}

export function validateBatchParameters(parameters) {
  if (parameters.world.initialAgents > 0 && parameters.agents.initialLineages > parameters.world.initialAgents) {
    return "initialLineages cannot exceed initialAgents";
  }
  return "";
}

function readIntegerOption(value, field, minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return { ok: false, error: `${field} must be a finite number` };
  }
  const integer = Math.floor(number);
  if (integer < minimum) {
    return { ok: false, error: `${field} must be at least ${minimum}` };
  }
  return { ok: true, value: integer };
}
