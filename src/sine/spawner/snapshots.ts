import type { SpawnerAgent } from "./types";
import { cloneLearnedState, cloneTraceStore, createEmptyTraceStore, sanitizePlasticityProfile } from "./plasticity";
import { normalizeSpawnerGenomeForCurrentContract } from "./genomeNormalize";

export function createSpawnerSnapshot(
  spawner: SpawnerAgent,
  {
    includeLearnedState = true,
    includeTraceStore = false,
  }: {
    includeLearnedState?: boolean;
    includeTraceStore?: boolean;
  } = {},
): SpawnerAgent {
  const snapshot = structuredClone(spawner);
  snapshot.genome = normalizeSpawnerGenomeForCurrentContract(snapshot.genome);
  snapshot.genome.plasticityProfile = sanitizePlasticityProfile(snapshot.genome.plasticityProfile);
  snapshot.learnedState = includeLearnedState
    ? cloneLearnedState(snapshot.learnedState, snapshot.genome.plasticityProfile.maxLearnedDelta)
    : cloneLearnedState(undefined);
  snapshot.traceStore = includeTraceStore ? cloneTraceStore(snapshot.traceStore) : createEmptyTraceStore();
  return snapshot;
}
