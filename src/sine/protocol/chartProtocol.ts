import type { SignalSample } from "../marketSignal";
import type { MarketDataSource } from "../marketRuntimeConfig";
import type { SpawnerDirection, SpawnerTelemetrySample } from "../spawnerSimulation";
import type { MarketWorkerSessionId } from "./workerCommandProtocol";

export type LeanSignalSample = Pick<SignalSample, "tick" | "signal" | "noise" | "parameters" | "price" | "sourceTimestamp" | "sourceDatetime">;

export type LeanPriceSample = {
  tick: number;
  price: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
};

export type ChartFoodMarker = {
  id: number;
  creatorSpawnerId: number;
  creatorLineageId: number;
  spawnTick: number;
  resolveTick: number;
  direction: SpawnerDirection;
  strength: number;
  horizonTicks: number;
  entrySignal: number;
  exitSignal?: number;
  payoff?: number;
  status: "pending" | "win" | "loss";
};

export type LeanTelemetrySample = Pick<SpawnerTelemetrySample, "tick" | "population" | "rollingLoss">;

export type LeanUniquenessTelemetrySample = {
  tick: number;
  medianRawDistance: number;
  p25RawDistance: number;
  p75RawDistance: number;
};

export type LeanSelectedUniquenessSample = {
  tick: number;
  rawDistance: number;
};

export type MarketChartPacket = {
  sessionId: MarketWorkerSessionId;
  version: number;
  renderTick: number;
  marketSource: MarketDataSource;
  currentSignal: number;
  currentNoise: number;
  currentPrice?: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
  ticksVisible: number;
  signalSamples: LeanSignalSample[];
  priceSamples?: LeanPriceSample[];
  visibleFoods: ChartFoodMarker[];
  telemetrySamples: LeanTelemetrySample[];
  telemetryStartTick: number;
  telemetryEndTick: number;
  telemetryPopulationMax: number;
  telemetryLossMax: number;
  uniquenessSamples: LeanUniquenessTelemetrySample[];
  selectedSpawnerUniquenessSamples: LeanSelectedUniquenessSample[];
  uniquenessStartTick: number;
  uniquenessEndTick: number;
  uniquenessRawDistanceMax: number;
  uniquenessSkippedReason?: "population_limit";
};
