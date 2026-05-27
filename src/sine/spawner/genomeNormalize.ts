import { OUTPUT_COUNT } from "./config";
import { sanitizeMutationProfile } from "./mutationProfile";
import { sanitizePayoffProfile } from "./payoffProfile";
import { sanitizePerception } from "./perception";
import { sanitizePlasticityProfile } from "./plasticity";
import { sanitizeTradingPolicy } from "./tradingPolicy";
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
    payoffProfile: sanitizePayoffProfile(partialGenome.payoffProfile),
    tradingPolicy: sanitizeTradingPolicy(partialGenome.tradingPolicy),
    mutationProfile: sanitizeMutationProfile(partialGenome.mutationProfile),
    plasticityProfile: sanitizePlasticityProfile(partialGenome.plasticityProfile),
  };
}
