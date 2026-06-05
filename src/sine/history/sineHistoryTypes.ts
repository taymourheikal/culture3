export type SineSessionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  status: "running" | "paused" | "stopped" | "completed" | "cancelled" | "failed";
  runMode?: "lab" | "headless" | string;
  marketSource?: string | null;
  seed?: number | null;
  targetTicks?: number | null;
  checkpointIntervalTicks?: number | null;
  minimumResolvedTrades?: number | null;
  terminationReason?: string | null;
  error?: string | null;
  births: number;
  deaths: number;
  stateSnapshots: number;
  headlessCheckpoints?: number;
  eligibleAgents?: number;
  reconstructionSnapshots?: number;
  reconstructableAgents?: number;
  latestTick: number;
  settings?: Record<string, unknown>;
  spawnerConfig?: Record<string, unknown>;
};

export type SineSeriesPoint = {
  tick: number;
  value: number;
};

export type SineHistogramBin = {
  label: string;
  min: number | null;
  max: number | null;
  count: number;
};

export type SineSummaryStats = {
  count: number;
  mean: number | null;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
};

export type SineRunTradeBreakdownRow = {
  bucket?: string;
  direction?: string;
  trades: number;
  hitRate: number | null;
  averagePayoff: number;
  totalPayoff: number;
};

export type SineRunEventBucket = {
  bucketStartTick: number;
  bucketEndTick: number;
  births: number;
  deaths: number;
  events: number;
};

export type SineAnalysisRange = {
  startTick: number;
  latestTick: number;
  fromPercent: number;
  toPercent: number;
  fromTick: number;
  toTick: number;
};

export type SineDeathCauseBucket = {
  bucketStartTick: number;
  bucketEndTick: number;
  lowEnergyDeaths: number;
  lowHealthDeaths: number;
  bothDeaths: number;
  unknownDeaths: number;
};

export type SineSessionDiagnostics = {
  range: SineAnalysisRange;
  health: {
    latestTick: number;
    finalPopulation: number;
    minPopulation: number;
    timeWeightedAveragePopulation: number;
    resolvedTrades: number;
    spawnedTrades: number;
    pendingTrades: number;
    wins: number;
    losses: number;
    hitRate: number;
    averagePayoff: number;
    cumulativePayoff: number;
    maxCumulativePayoffDrawdown: number;
    worstSingleTickPayoff: number;
  };
  resilience: {
    populationSeries: Array<{ tick: number; population: number }>;
    thresholdTicks: Array<{ threshold: number; ticks: number }>;
    deathCauseSeries: SineDeathCauseBucket[];
    unknownDeathCauses: number;
    churnBuckets: SineRunEventBucket[];
    worstPopulationDrawdown: number;
    averagePopulationDrawdown: number;
    worstSingleTickPopulationDrop: number;
    minPopulation: number;
    maxPopulation: number;
    timeWeightedAveragePopulation: number;
  };
  tradingPerformance: {
    cumulativePayoffSeries: Array<{ tick: number; cumulativePayoff: number; drawdown: number; tickPayoff: number; trades: number }>;
    bucketSeries: Array<{
      bucketStartTick: number;
      bucketEndTick: number;
      trades: number;
      wins: number;
      hitRate: number;
      averagePayoff: number;
      totalPayoff: number;
    }>;
    bucketDownsideVolatility: number;
    bucketVaR1: number | null;
    bucketCVaR1: number | null;
    bucketVaR5: number | null;
    bucketCVaR5: number | null;
    maxCumulativePayoffDrawdown: number;
    worstSingleTickPayoff: number;
    worstBucket: {
      bucketStartTick: number;
      bucketEndTick: number;
      totalPayoff: number;
      averagePayoff: number;
      trades: number;
    } | null;
  };
  tradeQuality: {
    filters: Array<{
      label: string;
      ageLabel: string;
      minTrades: number;
      minAgePercentile: number;
      minAgeTicks: number;
      eligibleAgents: number;
      undefinedSharpeAgents: number;
      agentsAboveSharpe075: number;
      undefinedSortinoAgents: number;
      agentsAboveSortino075: number;
      sharpeSummary: SineSummaryStats;
      sortinoSummary: SineSummaryStats;
      downsideVolatilitySummary: SineSummaryStats;
      sharpeHistogram: SineHistogramBin[];
      sortinoHistogram: SineHistogramBin[];
      downsideVolatilityHistogram: SineHistogramBin[];
      averagePayoffHistogram: SineHistogramBin[];
      hitRateHistogram: SineHistogramBin[];
      resolvedTradesHistogram: SineHistogramBin[];
    }>;
  };
  riskTail: {
    payoffHistogram: SineHistogramBin[];
    worst1PctPayoff: number | null;
    worst5PctPayoff: number | null;
    worst10PctPayoff: number | null;
    best1PctPayoff: number | null;
    best5PctPayoff: number | null;
    best10PctPayoff: number | null;
    tradeVaR1: number | null;
    tradeCVaR1: number | null;
    tradeVaR5: number | null;
    tradeCVaR5: number | null;
    tradeDownsideVolatility: number;
    averageAbsolutePayoff: number;
    byDirection: SineRunTradeBreakdownRow[];
    byHorizon: SineRunTradeBreakdownRow[];
    byStrength: SineRunTradeBreakdownRow[];
  };
  populationStructure: {
    birthDeathTimeline: SineRunEventBucket[];
    maxGenerationEver: number;
    liveLineageCount: number;
    topLineageId: number | null;
    topLineagePopulationShare: number;
    topLineagePayoffLineageId: number | null;
    topLineagePayoffShare: number;
    top3LineagePopulationShare: number;
    birthsPer1000Ticks: number;
    deathsPer1000Ticks: number;
    ageSummary: SineSummaryStats;
    ageHistogram: SineHistogramBin[];
  };
};

export type SineSessionAnalysis = {
  session: {
    id: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
    status: string;
    runMode?: string;
    seed?: number | null;
    targetTicks?: number | null;
    checkpointIntervalTicks?: number | null;
    minimumResolvedTrades?: number | null;
    terminationReason?: string | null;
    error?: string | null;
    settings: Record<string, unknown>;
    spawnerConfig: Record<string, number>;
  };
  diagnostics: SineSessionDiagnostics;
};

export type SineCohortTrend = "up" | "flat" | "down" | "unknown";
export type SineCohortVolatility = "low" | "medium" | "high" | "unknown";
export type SineCohortRegimeStatus = "available" | "partial" | "missing" | "unknown";

export type SineCohortTimelineBucket = {
  index: number;
  bucketStartTick: number;
  bucketEndTick: number;
  tick: number;
  trades: number;
  uniqueAgents: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  averagePayoff: number;
  totalPayoff: number;
  cumulativePayoff: number;
  drawdown: number;
  longCount: number;
  shortCount: number;
  trend: SineCohortTrend;
  volatility: SineCohortVolatility;
};

export type SineCohortRegimeCell = {
  trend: SineCohortTrend;
  volatility: SineCohortVolatility;
  trades: number;
  uniqueAgents: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  averagePayoff: number;
  totalPayoff: number;
};

export type SineCohortConcentration = {
  totalTrades: number;
  activeAgents: number;
  activeBucketCount: number;
  activeBucketCoverage: number;
  topAgentTradeShare: number;
  topAgentAbsolutePayoffShare: number;
  topLineageTradeShare: number;
  timingOverlapScore: number;
};

export type SineSessionCohortAnalysis = {
  sessionId: string;
  range: SineAnalysisRange;
  filter: {
    minTrades: number;
    minAgePercentile: number;
    minAgeTicks: number;
    eligibleAgents: number;
    activeAgents: number;
  };
  bucketCount: number;
  market: {
    source: string;
    regimeStatus: SineCohortRegimeStatus;
    snappedStartTimestamp: number | null;
  };
  timeline: SineCohortTimelineBucket[];
  regimeGrid: SineCohortRegimeCell[];
  concentration: SineCohortConcentration;
};
