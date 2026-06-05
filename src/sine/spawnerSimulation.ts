export { DEFAULT_SPAWNER_CONFIG, INPUT_COUNT, OUTPUT_COUNT, OUTPUT_INDEX, OUTPUT_LABELS } from "./spawner/config";
export {
  alignHiddenState,
  alignedHiddenState,
  applyBrainEvaluation,
  evaluateSpawnerBrain,
  evaluateSpawnerBrainPure,
  forwardSpawner,
  materializeBrainEvaluationActivations,
  type BrainEvaluation,
  type PureBrainEvaluationInput,
} from "./spawner/brain";
export { createSyncBrainEvaluationRunner, evaluateBrainJob } from "./spawner/brainEvaluationRunner";
export { activeConnectionForInnovation, brainPlanSignature, compileBrainPlan, ensureCompiledBrainPlan, type CompiledBrainPlan } from "./spawner/brainPlan";
export {
  createEffectiveGenomeView,
  getEffectiveConnectionWeight,
  getEffectiveConnectionDetail,
  getEffectiveGateBiasDetail,
  getEffectiveGateBias,
  getEffectiveOutputBiasDetail,
  getEffectiveOutputBias,
  materializeEffectiveGenomeForInheritance,
  type EffectiveValueDetail,
  type EffectiveGenomeView,
} from "./spawner/effectiveGenome";
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
export { payoffProfileDetailRows } from "./spawner/payoffProfile";
export { perceptionDetailRows, summarizePerception } from "./spawner/perception";
export { tradingPolicyDetailRows } from "./spawner/tradingPolicy";
export {
  applyFoodResolutionLearning,
  applyLearningSignal,
  applyReproductionLearning,
  captureDecisionTrace,
  learningSignalFromPayoff,
  pruneDecisionTraces,
} from "./spawner/learning";
export {
  DEFAULT_PLASTICITY_PROFILE,
  clampLearnedState,
  cloneLearnedState,
  clonePlasticityProfile,
  cloneTraceStore,
  connectionDeltaKey,
  createEmptyLearnedState,
  createEmptyTraceStore,
  decayLearnedState,
  driftPlasticityProfile,
  gateBiasDeltaKey,
  learnedStateDecayCanChange,
  learnedStateNorm,
  materializeDecisionTrace,
  outputBiasDeltaKey,
  plasticitySummary,
  sanitizeLearnedState,
  sanitizePlasticityProfile,
  sanitizeTraceStore,
} from "./spawner/plasticity";
export { computeSpawnerUniqueness, type SpawnerUniquenessScore } from "./spawner/uniqueness";
export { buildFunctionalGenomeVector } from "./spawner/uniquenessVector";
export {
  createFoodRuntimeIndex,
  createSpawnerRuntimeIndex,
  getLivingSpawner,
  isSpawnerAlive,
  pendingFoodCountForCreator,
  type FoodRuntimeIndex,
  type SpawnerRuntimeIndex,
} from "./spawner/runtimeIndex";
export { summarizeSpawnerPerformance } from "./spawner/performance";
export {
  currentReproductionCost,
  currentReproductionEnergyRequirement,
  populationPressure,
  populationRoomRatio,
  reproductionCostMultiplier,
} from "./spawner/reproductionPressure";
export {
  advanceSpawnerWorldToTimeline,
  advanceSpawnerWorldToTimelineAsync,
  applySpawnerUpkeep,
  createSpawnerWorld,
  energyRatioInput,
  getVisibleSpawnerFoods,
  removeDeadSpawners,
  spawnerAveragePayoff,
  spawnerHitRate,
  tryReproduceSpawner,
  type SpawnerAdvanceOptions,
  type SpawnerPhaseInstrumentation,
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
  SpawnerDeathCause,
  SpawnerDirection,
  SpawnerEvent,
  SpawnerFood,
  SpawnerLineage,
  SpawnerGenome,
  SpawnerDecisionTrace,
  SpawnerLearnedState,
  SpawnerMutationProfile,
  SpawnerPayoffProfile,
  SpawnerPerception,
  SpawnerPerceptionLagPair,
  SpawnerPlasticityProfile,
  SpawnerTradingPolicy,
  SpawnerTelemetrySample,
  SpawnerTraceStore,
  SpawnerWorld,
} from "./spawner/types";
