import { OUTPUT_COUNT } from "./config";
import { sanitizeMutationProfile } from "./mutationProfile";
import { sanitizePerception } from "./perception";
import type { SpawnerGenome } from "./types";

export function normalizeSpawnerGenomeForCurrentContract(genome: SpawnerGenome): SpawnerGenome {
  const outputBias = [...(Array.isArray(genome.outputBias) ? genome.outputBias : [])];
  while (outputBias.length < OUTPUT_COUNT) outputBias.push(0);
  if (outputBias.length > OUTPUT_COUNT) outputBias.length = OUTPUT_COUNT;
  const partialGenome = genome as Partial<SpawnerGenome>;

  return {
    ...genome,
    outputBias,
    perception: sanitizePerception(partialGenome.perception),
    mutationProfile: sanitizeMutationProfile(partialGenome.mutationProfile),
  };
}
