export { DEFAULT_SPAWNER_CONFIG, INPUT_COUNT, OUTPUT_COUNT, OUTPUT_INDEX, OUTPUT_LABELS } from "./spawner/config";
export { alignHiddenState, forwardSpawner } from "./spawner/brain";
export {
  activeConnections,
  activeLayerIndexes,
  activeUnits,
  addRandomLegalConnection,
  architectureMetrics,
  connectionInnovationId,
  createInnovationRegistry,
  createRandomGenome,
  getOrCreateConnectionInnovationId,
  isLegalConnection,
  mutateGenome,
  normalizeSpawnerGenomeForCurrentContract,
  validateGenome,
} from "./spawner/genome";
export { SeededRng } from "./spawner/rng";
export { mutationProfileDetailGroups, summarizeMutationProfile } from "./spawner/mutationProfile";
export { perceptionDetailRows, summarizePerception } from "./spawner/perception";
export { computeSpawnerUniqueness, type SpawnerUniquenessScore } from "./spawner/uniqueness";
export { buildFunctionalGenomeVector } from "./spawner/uniquenessVector";
export {
  advanceSpawnerWorldToTimeline,
  createSpawnerWorld,
  getVisibleSpawnerFoods,
  isSpawnerAlive,
  spawnerAveragePayoff,
  spawnerHitRate,
} from "./spawner/world";
export type {
  ConnectionGene,
  ConnectionSource,
  ConnectionTarget,
  FoodStatus,
  GateType,
  HiddenUnitGene,
  InnovationRegistry,
  OutputName,
  SpawnerAgent,
  SpawnerConfig,
  SpawnerDirection,
  SpawnerEvent,
  SpawnerFood,
  SpawnerLineage,
  SpawnerGenome,
  SpawnerMutationProfile,
  SpawnerPerception,
  SpawnerPerceptionLagPair,
  SpawnerTelemetrySample,
  SpawnerWorld,
} from "./spawner/types";
