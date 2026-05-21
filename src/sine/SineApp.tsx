import { CircleHelp, Pause, Play, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_ROC, type WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS } from "./marketSettingBounds";
import { getTimelineSampleAt } from "./marketTimeline";
import {
  architectureMetrics,
  getVisibleSpawnerFoods,
  spawnerAveragePayoff,
  spawnerHitRate,
  type SpawnerAgent,
  type SpawnerFood,
  type SpawnerWorld,
} from "./spawnerSimulation";
import { clamp } from "./charts/canvas";
import { drawNoiseChart } from "./charts/noiseChart";
import { drawParameterChart } from "./charts/parameterChart";
import { drawSignalChart, pickSignalChartFood } from "./charts/signalChart";
import { drawTelemetryChart } from "./charts/telemetryChart";
import { formatSignedPercent, formatSlope, roundForInput } from "./charts/format";
import { saveMarketSettingsGroup } from "./settingsStorage";
import { SPAWNER_CONFIG_BOUNDS } from "./spawnerConfigBounds";
import { saveSpawnerConfigGroup } from "./spawnerSettingsStorage";
import { INPUT_COUNT, OUTPUT_COUNT, type SpawnerConfig } from "./spawnerSimulation";
import { useMarketSimulation } from "./useMarketSimulation";

type ControlConfig = {
  key: keyof WaveSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  display: (settings: WaveSettings) => string;
};

type ControlGroup = {
  key: string;
  title: string;
  controls: ControlConfig[];
};

type SpawnerControlConfig = {
  key: keyof SpawnerConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  help?: string;
};

type SpawnerControlGroup = {
  key: string;
  title: string;
  controls: SpawnerControlConfig[];
};

const MARKET_SIGNAL_CONTROLS: ControlConfig[] = [
  marketField("amplitude", "Amplitude", (settings) => `${settings.amplitude.toFixed(2)}%`),
  marketField("frequency", "Frequency", (settings) => `${settings.frequency.toFixed(2)} cyc/s`),
  marketField("phase", "Phase", (settings) => `${settings.phase.toFixed(2)} rad`),
  marketField("speed", "Speed", (settings) => `${settings.speed.toFixed(2)}x`),
  marketField("slope", "Slope", (settings) => formatSlope(settings.slope)),
];

const NOISE_CONTROLS: ControlConfig[] = [
  marketField("noiseAmplitude", "Noise amplitude", (settings) => `${settings.noiseAmplitude.toFixed(2)}%`),
  marketField("noiseFrequency", "Noise roughness", (settings) => `${settings.noiseFrequency.toFixed(2)}x`),
  marketField("noiseSeed", "Noise seed", (settings) => String(settings.noiseSeed)),
];

const REGIME_CONTROLS: ControlConfig[] = [
  marketField("amplitudeDrift", "Amplitude drift", (settings) => `+/-${settings.amplitudeDrift.toFixed(2)}%`),
  marketField("frequencyDrift", "Frequency drift", (settings) => `+/-${settings.frequencyDrift.toFixed(3)} cyc/s`),
  marketField("slopeDrift", "Slope drift", (settings) => `+/-${settings.slopeDrift.toFixed(2)}%/s`),
  marketField("noiseAmplitudeDrift", "Noise amp drift", (settings) => `+/-${settings.noiseAmplitudeDrift.toFixed(2)}%`),
  marketField("noiseFrequencyDrift", "Noise rough drift", (settings) => `+/-${settings.noiseFrequencyDrift.toFixed(2)}x`),
  marketField("regimeSpeed", "Regime speed", (settings) => `${settings.regimeSpeed.toFixed(2)}x`),
  marketField("regimeSeed", "Regime seed", (settings) => String(settings.regimeSeed)),
];

const CONTROL_GROUPS: ControlGroup[] = [
  { key: "market", title: "Market Signal", controls: MARKET_SIGNAL_CONTROLS },
  { key: "noise", title: "Smooth Noise", controls: NOISE_CONTROLS },
  { key: "regime", title: "Regime Drift", controls: REGIME_CONTROLS },
];

const SPAWNER_CONTROL_GROUPS: SpawnerControlGroup[] = [
  {
    key: "population",
    title: "Population",
    controls: [
      spawnerField("Initial spawner agents", "initialSpawners", 1, 500, 1),
      spawnerField("Max population", "maxSpawners", 1, 1000, 1),
      spawnerField("Death energy", "deathEnergy", -100, 100, 0.5),
      spawnerField("Death health", "deathHealth", -50, 100, 1),
      spawnerField("Initial energy min", "initialEnergyMin", 0, 200, 0.5),
      spawnerField("Initial energy max", "initialEnergyMax", 0, 250, 0.5),
      spawnerField("Initial health", "initialHealth", 1, 300, 1),
      spawnerField("Initial cooldown max", "initialCooldownMax", 0, 10, 0.05),
    ],
  },
  {
    key: "spawning",
    title: "Opportunity Spawning",
    controls: [
      spawnerField("Spawn threshold", "spawnThreshold", 0, 1.5, 0.01),
      spawnerField("Spawn cost", "spawnCost", 0, 20, 0.05),
      spawnerField("Min energy surplus", "minimumSpawnEnergySurplus", 0, 20, 0.05),
      spawnerField("Min signal strength", "minSignalStrength", 0, 1, 0.01),
      spawnerField("Pending density divisor", "pendingDensityDivisor", 1, 1000, 1),
      spawnerField("History seconds", "foodHistorySeconds", 1, 600, 1),
    ],
  },
  {
    key: "trade",
    title: "Trade / Reward",
    controls: [
      spawnerField("Transaction cost", "transactionCost", 0, 2, 0.001),
      spawnerField("Reward scale", "rewardScale", 0, 50, 0.1),
      spawnerField("Loss health scale", "lossHealthScale", 0, 50, 0.1),
      spawnerField("Win health gain scale", "healthGainScale", 0, 20, 0.1),
      spawnerField("World payoff window", "recentResolvedPayoffWindow", 1, 500, 1),
      spawnerField("Agent payoff window", "agentRecentPayoffWindow", 1, 200, 1),
    ],
  },
  {
    key: "reproduction",
    title: "Reproduction",
    controls: [
      spawnerField("Reproduction energy", "reproductionEnergy", 0, 200, 0.5),
      spawnerField("Reproduction cost", "reproductionCost", 0, 100, 0.5),
      spawnerField("Minimum resolved trades", "reproductionMinResolved", 0, 100, 1),
      spawnerField("Minimum average payoff", "reproductionMinAveragePayoff", -5, 5, 0.001),
    ],
  },
  {
    key: "architecture",
    title: "Initial Brain",
    controls: [
      spawnerField("Initial hidden units min", "initialHiddenUnitsMin", 1, 256, 1),
      spawnerField("Initial hidden units max", "initialHiddenUnitsMax", 1, 512, 1),
      spawnerField("Input connections per unit", "initialInputConnectionsPerUnit", 0, 64, 1),
      spawnerField("Recurrent connections per unit", "initialRecurrentConnectionsPerUnit", 0, 64, 1),
      spawnerField("Output connections per output", "initialOutputConnectionsPerOutput", 0, 128, 1),
      spawnerField("New unit initial connections", "newUnitInitialConnections", 0, 128, 1),
      spawnerField("Gate bias stddev", "gateBiasStdDev", 0, 2, 0.01),
      spawnerField("Output bias stddev", "outputBiasStdDev", 0, 2, 0.01),
    ],
  },
  {
    key: "topology",
    title: "Topology Mutation",
    controls: [
      spawnerField("Add unit rate", "addUnitRate", 0, 1, 0.001),
      spawnerField("Disable unit rate", "disableUnitRate", 0, 1, 0.001),
      spawnerField("Re-enable unit rate", "reenableUnitRate", 0, 1, 0.001),
      spawnerField("Add connection rate", "addConnectionRate", 0, 1, 0.001),
      spawnerField("Disable connection rate", "disableConnectionRate", 0, 1, 0.001),
      spawnerField("Re-enable connection rate", "reenableConnectionRate", 0, 1, 0.001),
      spawnerField("Existing layer chance", "newUnitExistingLayerChance", 0, 1, 0.001),
      spawnerField("New layer chance", "newUnitNewLayerChance", 0, 1, 0.001),
      spawnerField("Allow skip connections", "allowSkipConnections", 0, 1, 1),
      spawnerField("Allow input-output links", "allowInputToOutputConnections", 0, 1, 1),
    ],
  },
  {
    key: "outputs",
    title: "Decision Outputs",
    controls: [
      spawnerField("Cooldown output multiplier", "cooldownOutputMultiplier", 0, 10, 0.05),
      spawnerField("Threshold bias init stddev", "thresholdBiasInitialStdDev", 0, 1, 0.001),
    ],
  },
  {
    key: "mutation",
    title: "Mutation",
    controls: [
      spawnerField("Weight mutation rate", "weightMutationRate", 0, 1, 0.001),
      spawnerField("Weight mutation stddev", "weightMutationStdDev", 0, 2, 0.001),
      spawnerField("Weight replace rate", "weightReplaceRate", 0, 1, 0.001),
      spawnerField("New connection stddev", "newConnectionWeightStdDev", 0, 2, 0.001),
      spawnerField("Bias mutation rate", "biasMutationRate", 0, 1, 0.001),
      spawnerField("Bias mutation stddev", "biasMutationStdDev", 0, 2, 0.001),
      spawnerField("Base mutation stddev", "baseMutationStdDev", 0, 1, 0.001),
      spawnerField("Mutation stddev drift", "mutationStdDevMutationStdDev", 0, 1, 0.001),
      spawnerField("Mutation stddev min", "mutationStdDevMin", 0, 1, 0.001),
      spawnerField("Mutation stddev max", "mutationStdDevMax", 0, 2, 0.001),
      spawnerField("Threshold bias mutation", "thresholdBiasMutationStdDev", 0, 1, 0.001),
      spawnerField("Threshold bias min", "thresholdBiasMin", -2, 2, 0.01),
      spawnerField("Threshold bias max", "thresholdBiasMax", -2, 2, 0.01),
      spawnerField("Min horizon mutation", "minHorizonMutationStdDev", 0, 5, 0.01),
      spawnerField("Max horizon mutation", "maxHorizonMutationStdDev", 0, 5, 0.01),
      spawnerField("Cooldown mutation", "cooldownBaseMutationStdDev", 0, 5, 0.01),
    ],
  },
  {
    key: "complexity",
    title: "Complexity Cost",
    controls: [
      spawnerField("Cost per active unit", "brainEnergyCostPerActiveUnit", 0, 1, 0.0001),
      spawnerField("Cost per active connection", "brainEnergyCostPerActiveConnection", 0, 1, 0.0001),
      spawnerField("Cost per active layer", "brainEnergyCostPerActiveLayer", 0, 1, 0.0001),
    ],
  },
  {
    key: "horizon",
    title: "Horizon / Cooldown Ranges",
    controls: [
      spawnerField("Initial min horizon min", "initialMinHorizonMin", 0, 20, 0.05),
      spawnerField("Initial min horizon max", "initialMinHorizonMax", 0, 20, 0.05),
      spawnerField("Initial max horizon min", "initialMaxHorizonMin", 0, 30, 0.05),
      spawnerField("Initial max horizon max", "initialMaxHorizonMax", 0, 30, 0.05),
      spawnerField("Min horizon clamp min", "minHorizonClampMin", 0, 20, 0.05),
      spawnerField("Min horizon clamp max", "minHorizonClampMax", 0, 20, 0.05),
      spawnerField("Max horizon clamp min", "maxHorizonClampMin", 0, 30, 0.05),
      spawnerField("Max horizon clamp max", "maxHorizonClampMax", 0, 30, 0.05),
      spawnerField("Cooldown initial min", "cooldownBaseInitialMin", 0, 20, 0.05),
      spawnerField("Cooldown initial max", "cooldownBaseInitialMax", 0, 20, 0.05),
      spawnerField("Cooldown clamp min", "cooldownBaseClampMin", 0, 20, 0.05),
      spawnerField("Cooldown clamp max", "cooldownBaseClampMax", 0, 20, 0.05),
    ],
  },
];

function getSpawnerHelp(key: keyof SpawnerConfig): string | undefined {
  const help: Partial<Record<keyof SpawnerConfig, string>> = {
    initialSpawners: "How many food-spawner agents start a new world. More agents means more competing entry ideas from tick one.",
    maxSpawners: "Hard cap on living spawner agents. Reproduction stops at this cap, and new worlds start no higher than it.",
    deathEnergy: "Agents below this energy are removed. Higher values make starvation happen sooner.",
    deathHealth: "Agents at or below this health are removed. Higher values make bad trades more lethal.",
    initialEnergyMin: "Lowest starting energy for new founder agents.",
    initialEnergyMax: "Highest starting energy for new founder agents.",
    initialHealth: "Starting health, and the current healing cap, for spawner agents.",
    initialCooldownMax: "Maximum random starting wait before a founder can spawn its first opportunity.",
    spawnThreshold: "Long or short scores must reach this value before an agent creates an opportunity marker.",
    spawnCost: "Base energy paid whenever an agent creates an opportunity.",
    minimumSpawnEnergySurplus: "Extra energy above spawn cost required before an agent is allowed to act.",
    minSignalStrength: "Lower bound for opportunity strength. Higher values make every spawned trade larger.",
    pendingDensityDivisor: "Scales how crowded the market feels to the NN based on unresolved opportunities.",
    foodHistorySeconds: "How long resolved opportunity markers remain visible on the chart.",
    transactionCost: "Flat cost subtracted from every resolved opportunity payoff.",
    rewardScale: "Multiplier converting positive payoff into agent energy.",
    lossHealthScale: "Multiplier converting negative payoff into health damage.",
    healthGainScale: "Multiplier converting positive payoff into health recovery.",
    recentResolvedPayoffWindow: "Number of recent resolved opportunities used for the global rolling loss chart.",
    agentRecentPayoffWindow: "Number of recent payoffs kept per agent for reproduction eligibility.",
    reproductionEnergy: "Minimum energy required before an agent can clone itself.",
    reproductionCost: "Energy paid by the parent when it reproduces.",
    reproductionMinResolved: "Minimum recent resolved opportunities needed before reproduction is allowed.",
    reproductionMinAveragePayoff: "Minimum recent average payoff needed before reproduction is allowed.",
    initialHiddenUnitsMin: "Lowest number of active recurrent memory units founder agents can start with.",
    initialHiddenUnitsMax: "Highest number of active recurrent memory units founder agents can start with.",
    initialInputConnectionsPerUnit: "How many sparse input-to-gate links each founder memory unit starts with.",
    initialRecurrentConnectionsPerUnit: "How many previous-memory links each founder memory unit starts with.",
    initialOutputConnectionsPerOutput: "How many hidden-to-output links each founder output starts with.",
    newUnitInitialConnections: "How many legal links are attempted when mutation adds a new memory unit.",
    addUnitRate: "Chance a child gains one new recurrent memory unit at birth.",
    disableUnitRate: "Chance a child disables one active memory unit at birth.",
    reenableUnitRate: "Chance a child re-enables one disabled memory unit at birth.",
    addConnectionRate: "Chance a child gains one new legal sparse connection at birth.",
    disableConnectionRate: "Chance a child disables one active connection at birth.",
    reenableConnectionRate: "Chance a child re-enables one disabled connection at birth.",
    newUnitExistingLayerChance: "Relative chance that a new memory unit appears in an already active layer.",
    newUnitNewLayerChance: "Relative chance that a new memory unit appears one layer deeper than the current deepest layer.",
    allowSkipConnections: "When on, lower layers may connect directly to deeper non-adjacent layers.",
    allowInputToOutputConnections: "When on, raw inputs may connect directly to outputs without hidden memory.",
    weightMutationRate: "Chance each connection weight mutates when a child is born.",
    weightMutationStdDev: "Typical size of small inherited weight changes.",
    weightReplaceRate: "Chance a mutating weight is replaced with a fresh random value instead of nudged.",
    newConnectionWeightStdDev: "Initial random weight spread for newly created sparse connections.",
    biasMutationRate: "Chance each gate or output bias mutates when a child is born.",
    biasMutationStdDev: "Typical size of inherited bias changes.",
    gateBiasStdDev: "Initial random bias spread for candidate, update, and reset gates.",
    outputBiasStdDev: "Initial random bias spread for long, short, strength, horizon, and cooldown outputs.",
    brainEnergyCostPerActiveUnit: "Optional extra metabolism for each active memory unit. Default is zero.",
    brainEnergyCostPerActiveConnection: "Optional extra metabolism for each active connection. Default is zero.",
    brainEnergyCostPerActiveLayer: "Optional extra metabolism for each active layer. Default is zero.",
    cooldownOutputMultiplier: "Scales the NN cooldown output. Higher values make actions create longer waits.",
    thresholdBiasInitialStdDev: "Initial random spread for each agent's general tendency to spawn opportunities.",
    baseMutationStdDev: "Starting size of random genome changes inherited by children.",
    mutationStdDevMutationStdDev: "How much the mutation size itself can change during reproduction.",
    mutationStdDevMin: "Lower clamp on inherited mutation size.",
    mutationStdDevMax: "Upper clamp on inherited mutation size.",
    thresholdBiasMutationStdDev: "Mutation size for the agent's spawn tendency bias.",
    thresholdBiasMin: "Lower clamp on spawn tendency bias.",
    thresholdBiasMax: "Upper clamp on spawn tendency bias.",
    minHorizonMutationStdDev: "Mutation size for the shortest prediction horizon.",
    maxHorizonMutationStdDev: "Mutation size for the longest prediction horizon.",
    cooldownBaseMutationStdDev: "Mutation size for each agent's base cooldown.",
    initialMinHorizonMin: "Lower end of the founder range for the shortest resolution horizon.",
    initialMinHorizonMax: "Upper end of the founder range for the shortest resolution horizon.",
    initialMaxHorizonMin: "Lower end of the founder range for the longest resolution horizon.",
    initialMaxHorizonMax: "Upper end of the founder range for the longest resolution horizon.",
    minHorizonClampMin: "Lowest value mutation can assign to the shortest allowed resolution horizon.",
    minHorizonClampMax: "Highest value mutation can assign to the shortest allowed resolution horizon.",
    maxHorizonClampMin: "Lowest value mutation can assign to the longest allowed resolution horizon.",
    maxHorizonClampMax: "Highest value mutation can assign to the longest allowed resolution horizon.",
    cooldownBaseInitialMin: "Lower end of the founder range for inherited base cooldown.",
    cooldownBaseInitialMax: "Upper end of the founder range for inherited base cooldown.",
    cooldownBaseClampMin: "Lowest value mutation can assign to inherited base cooldown.",
    cooldownBaseClampMax: "Highest value mutation can assign to inherited base cooldown.",
  };
  return help[key];
}


type SineView = "lab" | "help";

export function SineApp() {
  const [view, setView] = useState<SineView>("lab");
  return view === "help" ? <SineHelpPage activeView={view} onViewChange={setView} /> : <SineLabView activeView={view} onViewChange={setView} />;
}

function SineLabView({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const parameterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedSpawnerIdRef = useRef<number | null>(null);
  const [selectedSpawnerId, setSelectedSpawnerId] = useState<number | null>(null);
  const [savedGroup, setSavedGroup] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"market" | "spawners">("market");
  const {
    simulation,
    settings,
    spawnerConfig,
    playing,
    time,
    version,
    backlogTicks,
    setPlaying,
    updateSetting,
    updateSpawnerConfig,
    replaceSpawnerConfig,
    reset: resetSimulation,
  } = useMarketSimulation();

  selectedSpawnerIdRef.current = selectedSpawnerId;

  useEffect(() => {
    const canvas = canvasRef.current;
    const noiseCanvas = noiseCanvasRef.current;
    const parameterCanvas = parameterCanvasRef.current;
    const telemetryCanvas = telemetryCanvasRef.current;
    if (!canvas || !noiseCanvas || !parameterCanvas || !telemetryCanvas) return;
    drawSignalChart(canvas, simulation.timeline, simulation.world, selectedSpawnerIdRef.current);
    drawNoiseChart(noiseCanvas, simulation.timeline);
    drawParameterChart(parameterCanvas, simulation.timeline);
    drawTelemetryChart(telemetryCanvas, simulation.world.telemetry);
  }, [simulation, selectedSpawnerId, version]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const noiseCanvas = noiseCanvasRef.current;
      const parameterCanvas = parameterCanvasRef.current;
      const telemetryCanvas = telemetryCanvasRef.current;
      if (canvas) drawSignalChart(canvas, simulation.timeline, simulation.world, selectedSpawnerIdRef.current);
      if (noiseCanvas) drawNoiseChart(noiseCanvas, simulation.timeline);
      if (parameterCanvas) drawParameterChart(parameterCanvas, simulation.timeline);
      if (telemetryCanvas) drawTelemetryChart(telemetryCanvas, simulation.world.telemetry);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [simulation]);

  const timeline = simulation.timeline;
  const spawnerWorld = simulation.world;
  const currentSignal = getTimelineSampleAt(timeline, timeline.time).signal;
  const visibleSpawnerFoods = useMemo(
    () => getVisibleSpawnerFoods(spawnerWorld, time, 16),
    // version tracks mutation inside simulationRef.current.world.
    [spawnerWorld, version, time],
  );
  const selectedSpawner = useMemo(
    () => spawnerWorld.spawners.find((spawner) => spawner.id === selectedSpawnerId) ?? null,
    [selectedSpawnerId, version, spawnerWorld],
  );

  useEffect(() => {
    if (selectedSpawnerId !== null && !selectedSpawner) {
      setSelectedSpawnerId(null);
    }
  }, [selectedSpawnerId, selectedSpawner]);

  const pendingFoods = spawnerWorld.foods.filter((food) => food.status === "pending").length;
  const resolvedFoods = spawnerWorld.foods.length - pendingFoods;

  const reset = () => {
    setSelectedSpawnerId(null);
    resetSimulation();
  };

  const selectFoodAtPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pickedFood = pickSignalChartFood(canvas, timeline, spawnerWorld, clientX, clientY);
    if (pickedFood) {
      setSelectedSpawnerId(pickedFood.creatorSpawnerId);
    }
  };

  return (
    <main className="sine-shell">
      <section className="sine-stage">
        <div className="sine-header">
          <div>
            <span className="sine-eyebrow">Toy Market Simulator</span>
            <h1>ROC Signal Lab</h1>
          </div>
          <SineViewTabs activeView={activeView} onViewChange={onViewChange} />
          <div className="sine-readout">
            <span>Current ROC</span>
            <strong>{formatSignedPercent(currentSignal)}</strong>
          </div>
        </div>

        <div className="sine-chart-wrap price-chart-wrap">
          <canvas
            ref={canvasRef}
            className="sine-canvas"
            onClick={(event) => selectFoodAtPoint(event.clientX, event.clientY)}
            title="Click a food marker to select its spawner"
          />
          <div className="time-marker-label">Current time</div>
        </div>

        <div className="sine-chart-wrap noise-chart-wrap">
          <div className="noise-chart-title">
            <span>Smooth random noise</span>
            <strong>{formatSignedPercent(getTimelineSampleAt(timeline, timeline.time).noise)}</strong>
          </div>
          <canvas ref={noiseCanvasRef} className="noise-canvas" />
          <div className="time-marker-label noise-marker-label">Current time</div>
        </div>

        <div className="sine-chart-wrap parameter-chart-wrap">
          <div className="parameter-chart-title">Effective parameters</div>
          <canvas ref={parameterCanvasRef} className="parameter-canvas" />
          <div className="parameter-legend">
            <span className="legend-amplitude">Amplitude</span>
            <span className="legend-frequency">Frequency</span>
            <span className="legend-slope">Slope</span>
            <span className="legend-noise-amplitude">Noise amp</span>
            <span className="legend-noise-frequency">Noise rough</span>
          </div>
        </div>

        <SpawnerRoster
          spawners={spawnerWorld.spawners}
          foods={visibleSpawnerFoods}
          world={spawnerWorld}
          pendingFoods={pendingFoods}
          totalWins={spawnerWorld.totalResolved - spawnerWorld.totalLosses}
          totalLosses={spawnerWorld.totalLosses}
          selectedSpawner={selectedSpawner}
          selectedSpawnerId={selectedSpawnerId}
          onSelect={setSelectedSpawnerId}
        />

        <div className="sine-chart-wrap telemetry-chart-wrap">
          <div className="telemetry-chart-title">Population & Loss</div>
          <canvas ref={telemetryCanvasRef} className="telemetry-canvas" />
          <div className="telemetry-legend">
            <span className="legend-population">Spawner population</span>
            <span className="legend-loss">Rolling loss</span>
          </div>
        </div>

        <div className="sine-footer-readout">
          <Metric label="Sim time" value={`${time.toFixed(2)}s`} />
          <Metric label="Base ROC" value={`${BASE_ROC.toFixed(2)}%`} />
          <Metric label="Amplitude" value={`${settings.amplitude.toFixed(2)}%`} />
          <Metric label="Frequency" value={`${settings.frequency.toFixed(3)} cyc/s`} />
          <Metric label="Slope" value={formatSlope(settings.slope)} />
          <Metric label="Noise" value={`+/-${settings.noiseAmplitude.toFixed(2)}% max`} />
          <Metric label="Spawners" value={String(spawnerWorld.spawners.length)} />
          <Metric label="Food markers" value={`${pendingFoods} pending / ${resolvedFoods} resolved`} />
          <Metric label="Catch-up backlog" value={`${backlogTicks} ticks`} />
        </div>
      </section>

      <aside className="sine-controls">
        <div className="sine-control-actions">
          <button type="button" className="sine-button primary" onClick={() => setPlaying((value) => !value)}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="sine-button" onClick={reset}>
            <RotateCcw size={17} />
            Reset
          </button>
        </div>

        <div className="sine-control-mode-tabs" aria-label="Simulator parameter menu">
          <button type="button" className={sidebarMode === "market" ? "active" : ""} onClick={() => setSidebarMode("market")}>
            Market
          </button>
          <button type="button" className={sidebarMode === "spawners" ? "active" : ""} onClick={() => setSidebarMode("spawners")}>
            Spawner Agents
          </button>
        </div>

        {sidebarMode === "market" ? (
          <div className="sine-parameters-stack">
            {CONTROL_GROUPS.map((group) => (
              <section className="sine-control-group" key={group.key}>
                <div className="sine-control-group-head">
                  <div className="sine-control-group-title">{group.title}</div>
                  <button
                    type="button"
                    className="save-group-button"
                    title={`Save ${group.title}`}
                    onClick={() => {
                      saveMarketSettingsGroup(
                        settings,
                        group.controls.map((control) => control.key),
                      );
                      setSavedGroup(`market:${group.key}`);
                    }}
                  >
                    <Save size={16} />
                  </button>
                </div>
                <div className="sine-parameter-fields">
                  {group.controls.map((control) => (
                    <ConfiguredControl
                      key={control.key}
                      control={control}
                      settings={settings}
                      onChange={(key, value) => {
                        updateSetting(key, value);
                        if (savedGroup === `market:${group.key}`) setSavedGroup(null);
                      }}
                    />
                  ))}
                </div>
                {savedGroup === `market:${group.key}` ? <div className="saved-defaults">Saved defaults</div> : null}
              </section>
            ))}
          </div>
        ) : (
          <div className="sine-parameters-stack">
            <section className="sine-control-group">
              <div className="sine-control-group-head">
                <div className="sine-control-group-title">NN Contract</div>
              </div>
              <div className="sine-readonly-grid">
                <Metric label="Recurrent type" value="GRU-like gates" />
                <Metric label="Inputs" value={String(INPUT_COUNT)} />
                <Metric label="Outputs" value={String(OUTPUT_COUNT)} />
              </div>
            </section>
            {SPAWNER_CONTROL_GROUPS.map((group) => (
              <section className="sine-control-group" key={group.key}>
                <div className="sine-control-group-head">
                  <div className="sine-control-group-title">{group.title}</div>
                  <button
                    type="button"
                    className="save-group-button"
                    title={`Save ${group.title}`}
                    onClick={() => {
                      const saved = saveSpawnerConfigGroup(
                        spawnerConfig,
                        group.controls.map((control) => control.key),
                      );
                      replaceSpawnerConfig(saved);
                      setSavedGroup(`spawners:${group.key}`);
                    }}
                  >
                    <Save size={16} />
                  </button>
                </div>
                <div className="sine-parameter-fields">
                  {group.controls.map((control) => (
                    <ConfiguredSpawnerControl
                      key={control.key}
                      control={control}
                      config={spawnerConfig}
                      onChange={(key, value) => {
                        updateSpawnerConfig(key, value);
                        if (savedGroup === `spawners:${group.key}`) setSavedGroup(null);
                      }}
                    />
                  ))}
                </div>
                {savedGroup === `spawners:${group.key}` ? <div className="saved-defaults">Saved defaults</div> : null}
              </section>
            ))}
          </div>
        )}
      </aside>
    </main>
  );
}

function SineHelpPage({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  return (
    <main className="sine-help-shell">
      <header className="sine-help-header">
        <div>
          <span className="sine-eyebrow">Toy Market Simulator</span>
          <h1>Help</h1>
        </div>
        <SineViewTabs activeView={activeView} onViewChange={onViewChange} />
      </header>

      <section className="sine-help-content">
        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">What This Simulator Is</div>
          <p>
            <strong>This is a toy market generator plus a population of food-spawning agents.</strong> The chart is not a real
            price. It is a simulated rate-of-change signal that trends, cycles, and changes its noise regime over time.
          </p>
          <ul>
            <li>The market generator creates the moving ROC line.</li>
            <li>Food-spawner agents watch that signal and decide when it looks like an opportunity.</li>
            <li>When an agent acts, it drops a food marker on the chart: long if it expects ROC to rise, short if it expects ROC to fall.</li>
            <li>The marker resolves after the agent&apos;s chosen horizon, then the agent gains or loses energy and health.</li>
          </ul>
          <div className="sine-system-map" aria-label="Simulation system map">
            <div className="sine-map-node source">
              <span>1</span>
              <strong>Market generator</strong>
              <small>Creates the ROC line and changing regimes.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node">
              <span>2</span>
              <strong>Observed features</strong>
              <small>Recent returns, trend, range, volatility, roughness, crowding.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node brain">
              <span>3</span>
              <strong>Spawner RNNs</strong>
              <small>Each agent decides whether this looks like an entry.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node food">
              <span>4</span>
              <strong>Food marker</strong>
              <small>Long or short marker with size, horizon, and cooldown.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node outcome">
              <span>5</span>
              <strong>Payoff</strong>
              <small>Resolved later as energy gain, loss, or health damage.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node mutation">
              <span>6</span>
              <strong>Reproduction</strong>
              <small>Successful agents clone with weight and topology mutations.</small>
            </div>
          </div>
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">How Food-Spawning Agents Work</div>
          <p>
            <strong>Agents do not know the future.</strong> They only see recent market conditions, their own energy and health,
            and how crowded the chart already is with unresolved opportunities.
          </p>
          <div className="sine-rnn-schematic" aria-label="Food spawner RNN schematic">
            <div className="sine-rnn-node">
              <span>Market history</span>
              <strong>15 inputs</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node primary">
              <span>Sparse GRU-like RNN</span>
              <strong>Evolving units</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node">
              <span>Decision layer</span>
              <strong>5 outputs</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node outcome">
              <span>Food marker</span>
              <strong>Reward or loss</strong>
            </div>
          </div>
          <div className="sine-io-grid" aria-label="Spawner input and output summary">
            <div className="sine-io-panel">
              <span className="sine-help-section-label">What the RNN can see</span>
              <div className="sine-chip-list">
                <span>ROC now</span>
                <span>Short changes</span>
                <span>Average ROC</span>
                <span>Volatility</span>
                <span>Range estimate</span>
                <span>Cycle estimate</span>
                <span>Trend estimate</span>
                <span>Residual roughness</span>
                <span>Open marker density</span>
                <span>Energy</span>
                <span>Health</span>
              </div>
            </div>
            <div className="sine-io-panel outputs">
              <span className="sine-help-section-label">What the RNN can choose</span>
              <div className="sine-chip-list">
                <span>Long</span>
                <span>Short</span>
                <span>Strength</span>
                <span>Horizon</span>
                <span>Cooldown</span>
              </div>
            </div>
          </div>
          <p>
            <strong>GRU-like RNN</strong> means the agent has a small memory that updates every tick. An update gate decides
            how much new information to write, a reset gate decides how much old memory to ignore, and a candidate memory
            proposes the next internal state. This lets an agent react to sequences, not just the current point on the chart.
          </p>
          <p>
            <strong>The architecture can now evolve.</strong> Children can gain or disable individual memory units, and units
            can appear in deeper layers. Connections can also appear or disappear. Inputs and outputs stay fixed, lower layers
            can feed deeper layers, and recurrent links use previous-tick memory so there are no same-tick loops.
          </p>
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Neural Network Inputs And Outputs</div>
          <p>
            <strong>The spawner NNs do not receive the generator&apos;s hidden settings.</strong> Amplitude, frequency, slope,
            and noise are estimated from recent observed ROC history, because a real market would not reveal those values directly.
          </p>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Inputs</p>
              <ul>
                <li>Current ROC value.</li>
                <li>Recent ROC changes across short lag windows.</li>
                <li>Recent average ROC and recent volatility.</li>
                <li>Estimated signal shape: local range, cycle rate, trend slope, residual volatility, and roughness.</li>
                <li>Pending opportunity density, meaning how crowded the chart is with unresolved food markers.</li>
                <li>The agent&apos;s energy ratio and health ratio.</li>
              </ul>
            </div>
            <div>
              <p className="sine-help-section-label">Outputs</p>
              <ul>
                <li><strong>Long score:</strong> whether to spawn a long opportunity.</li>
                <li><strong>Short score:</strong> whether to spawn a short opportunity.</li>
                <li><strong>Strength:</strong> how large the opportunity should be.</li>
                <li><strong>Horizon:</strong> how long to wait before judging the opportunity.</li>
                <li><strong>Cooldown:</strong> how long the agent waits before it can act again.</li>
              </ul>
            </div>
          </div>
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Architecture Rules</div>
          <p>
            <strong>Inputs and outputs are fixed; the hidden memory graph can evolve.</strong> A child may gain one new unit,
            lose one unit, or change one connection at birth. Layers emerge one unit at a time when a new unit is placed deeper
            than the existing active units.
          </p>
          <div className="sine-layer-diagram" aria-label="Allowed and blocked neural architecture connections">
            <div className="sine-layer-stack">
              <div className="sine-layer input">Inputs</div>
              <div className="sine-layer hidden">Layer 1 memory</div>
              <div className="sine-layer hidden deep">Layer 2 memory</div>
              <div className="sine-layer output">Outputs</div>
            </div>
            <div className="sine-connection-board">
              <div className="sine-connection allowed">Inputs -&gt; hidden units</div>
              <div className="sine-connection allowed">Lower layer -&gt; deeper layer</div>
              <div className="sine-connection allowed">Hidden units -&gt; outputs</div>
              <div className="sine-connection allowed">Previous memory -&gt; same unit next tick</div>
              <div className="sine-connection blocked">Higher layer -&gt; lower layer</div>
              <div className="sine-connection blocked">Same-tick hidden loops</div>
              <div className="sine-connection blocked">Previous memory -&gt; output directly</div>
              <div className="sine-connection blocked">Outputs -&gt; hidden units</div>
            </div>
          </div>
          <div className="sine-rule-grid">
            <div className="sine-rule-card allowed">
              <strong>Allowed to mutate</strong>
              <ul>
                <li>Weights and biases can drift randomly.</li>
                <li>One hidden memory unit can be added or disabled.</li>
                <li>One connection can be added, disabled, or re-enabled.</li>
                <li>A new unit can appear in a deeper layer by chance.</li>
                <li>Each agent can end up with a different hidden graph.</li>
              </ul>
            </div>
            <div className="sine-rule-card blocked">
              <strong>Not allowed</strong>
              <ul>
                <li>The 15 input meanings do not change.</li>
                <li>The 5 output meanings do not change.</li>
                <li>Connections cannot point backward from deeper layers to earlier layers.</li>
                <li>Hidden units cannot form same-tick cycles.</li>
                <li>Outputs cannot feed back into the hidden memory.</li>
              </ul>
            </div>
          </div>
        </article>

        <article className="sine-help-panel">
          <div className="sine-help-panel-title">Reward And Loss</div>
          <p>
            <strong>There is no training loss function in the usual machine-learning sense.</strong> The RNN weights are not
            updated by backpropagation while an agent is alive.
          </p>
          <p>
            A marker&apos;s payoff is based on whether ROC moved in the predicted direction before the horizon ended. Long
            markers benefit from ROC rising. Short markers benefit from ROC falling. The payoff is scaled by marker strength
            and reduced by transaction cost.
          </p>
          <ul>
            <li>Positive payoff adds energy and can restore some health.</li>
            <li>Negative payoff removes energy and damages health.</li>
            <li>The chart&apos;s loss line is the recent average negative payoff from resolved markers.</li>
          </ul>
        </article>

        <article className="sine-help-panel">
          <div className="sine-help-panel-title">Rolling Loss</div>
          <p>
            <strong>Rolling loss is the average recent damage from resolved food markers.</strong> The simulator keeps a
            recent payoff window. For each payoff in that window, wins are converted to <strong>0</strong> and losses are
            converted to their positive loss size.
          </p>
          <p>
            In plain terms: <strong>Rolling loss = average of max(0, -payoff) across recent resolved markers.</strong> A
            payoff of +0.20 adds 0 to rolling loss. A payoff of -0.20 adds 0.20. A higher line means recent opportunities
            have been more harmful. A lower line means recent resolved markers have been less harmful, or mostly profitable.
          </p>
          <p>
            <strong>If trading were completely random,</strong> rolling loss would not fall to zero. It would usually hover
            around the average downside of random entries after transaction costs, with more wobble when few markers resolve
            and a steadier line when many markers resolve.
          </p>
          <p>
            <strong>Population affects how much evidence is flowing into the metric.</strong> A large population can create
            more markers, so rolling loss updates more often and may reflect the crowd&apos;s current behavior quickly. A small
            population creates fewer markers, so the line can look quieter, stale, or jumpy because it is based on fewer
            recent outcomes.
          </p>
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Evolution And Mutation</div>
          <p>
            <strong>Agents evolve by surviving long enough to reproduce.</strong> An agent can clone itself when it has enough
            energy, enough resolved trades, and a good enough recent average payoff.
          </p>
          <p>
            <strong>Energy is spendable fuel; health is damage tolerance.</strong> Newborn agents inherit the parent&apos;s
            brain, but they start with configured starting energy and health rather than copying the parent&apos;s current values.
          </p>
          <ul>
            <li>Children inherit the parent&apos;s RNN units, connections, weights, biases, horizons, cooldown, and mutation size.</li>
            <li>Small random mutations can change weights and biases at birth.</li>
            <li>Structural mutations can add or disable one memory unit, or add, disable, or re-enable one connection.</li>
            <li>Layers are not added as full blocks. They emerge when a new unit appears deeper than the current deepest active layer.</li>
            <li>Bad entry behavior tends to lose energy or health, which prevents reproduction or kills the agent.</li>
            <li>Useful entry behavior tends to create more energy, which gives that lineage more chances to spread.</li>
          </ul>
          <div className="sine-lifecycle" aria-label="Spawner agent mutation lifecycle">
            <div className="sine-life-step">
              <span>1</span>
              <strong>Agent acts</strong>
              <small>It places long or short food when its outputs pass the action threshold.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>2</span>
              <strong>Marker resolves</strong>
              <small>The later ROC move becomes a payoff after cost.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>3</span>
              <strong>Energy changes</strong>
              <small>Good entries feed reproduction; bad entries damage health.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>4</span>
              <strong>Child is born</strong>
              <small>The brain is copied, then weights, biases, units, or links may mutate.</small>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function SineViewTabs({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  return (
    <div className="sine-view-tabs" aria-label="Toy market simulator view">
      <button type="button" className={activeView === "lab" ? "active" : ""} onClick={() => onViewChange("lab")}>
        Lab
      </button>
      <button type="button" className={activeView === "help" ? "active" : ""} onClick={() => onViewChange("help")} title="Help">
        <CircleHelp size={15} />
        Help
      </button>
    </div>
  );
}

function marketField(key: keyof WaveSettings, label: string, display: (settings: WaveSettings) => string): ControlConfig {
  return { key, label, ...MARKET_SETTING_BOUNDS[key], display };
}

function spawnerField(label: string, key: keyof SpawnerConfig, min: number, max: number, step: number): SpawnerControlConfig {
  const bounds = SPAWNER_CONFIG_BOUNDS[key] ?? { min, max, step };
  return { label, key, min: bounds.min, max: bounds.max, step: bounds.step, help: getSpawnerHelp(key) };
}

function ConfiguredControl({
  control,
  settings,
  onChange,
}: {
  control: ControlConfig;
  settings: WaveSettings;
  onChange: (key: keyof WaveSettings, value: number) => void;
}) {
  return (
    <ControlSlider
      label={control.label}
      value={settings[control.key]}
      min={control.min}
      max={control.max}
      step={control.step}
      display={control.display(settings)}
      onChange={(value) => onChange(control.key, value)}
    />
  );
}

function ConfiguredSpawnerControl({
  control,
  config,
  onChange,
}: {
  control: SpawnerControlConfig;
  config: SpawnerConfig;
  onChange: (key: keyof SpawnerConfig, value: number) => void;
}) {
  return (
    <ControlSlider
      label={control.label}
      value={config[control.key]}
      min={control.min}
      max={control.max}
      step={control.step}
      display={String(roundForInput(config[control.key], control.step))}
      help={control.help}
      onChange={(value) => onChange(control.key, value)}
    />
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  help?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sine-slider">
      <div>
        <span className="sine-slider-label">
          {label}
          {help ? (
            <span className="sine-help" tabIndex={0} aria-label={help}>
              <CircleHelp size={13} aria-hidden="true" />
              <span className="sine-help-tooltip" role="tooltip">
                {help}
              </span>
            </span>
          ) : null}
        </span>
        <span className="sine-slider-value">
          <strong>{display}</strong>
          <input
            type="number"
            value={roundForInput(value, step)}
            min={min}
            max={max}
            step={step}
            onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          />
        </span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sine-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SpawnerRoster({
  spawners,
  foods,
  world,
  pendingFoods,
  totalWins,
  totalLosses,
  selectedSpawner,
  selectedSpawnerId,
  onSelect,
}: {
  spawners: SpawnerAgent[];
  foods: SpawnerFood[];
  world: SpawnerWorld;
  pendingFoods: number;
  totalWins: number;
  totalLosses: number;
  selectedSpawner: SpawnerAgent | null;
  selectedSpawnerId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const visibleFoods = foods.length;
  const selectedMetrics = selectedSpawner ? architectureMetrics(selectedSpawner.genome) : null;
  const recentDeathEvents = world.recentEvents.filter((event) => event.kind === "death").slice(-4);

  return (
    <section className="spawner-panel">
      <div className="spawner-panel-header">
        <div>
          <span className="sine-eyebrow">Food Spawner RNNs</span>
          <h2>Opportunity scouts</h2>
        </div>
        <div className="spawner-summary">
          <span>{spawners.length} active</span>
          <span>{pendingFoods} pending</span>
          <span>{totalWins} wins</span>
          <span>{totalLosses} losses</span>
          <span>{visibleFoods} visible</span>
        </div>
      </div>

      <div className={`spawner-event-strip${recentDeathEvents.length === 0 ? " empty" : ""}`} aria-label="Recent spawner deaths">
        {recentDeathEvents.length > 0 ? (
          recentDeathEvents.map((event) => (
            <span key={event.id}>
              death #{event.spawnerId}
            </span>
          ))
        ) : (
          <span aria-hidden="true">No recent deaths</span>
        )}
      </div>

      <div className="spawner-roster" aria-label="Food spawner agents">
        {spawners.map((spawner) => {
          const spawnerPendingFoods = world.foods.filter((food) => food.creatorSpawnerId === spawner.id && food.status === "pending").length;
          const recentAverage =
            spawner.recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, spawner.recentPayoffs.length);
          const isNewborn = world.tick - spawner.birthTick <= Math.round(1.2 / world.config.tickSeconds);
          return (
          <div
            key={spawner.id}
            className={`spawner-card${selectedSpawnerId === spawner.id ? " selected" : ""}${isNewborn ? " newborn" : ""}`}
          >
            <button
              type="button"
              className="spawner-card-head"
              onClick={() => onSelect(selectedSpawnerId === spawner.id ? null : spawner.id)}
            >
              <span className="spawner-avatar">
                {spawner.id}
              </span>
              <span className="spawner-card-meta">
                <small>L{spawner.lineageId} / gen {spawner.generation}</small>
                <small>{spawner.cooldown.toFixed(1)}s cooldown</small>
              </span>
              <span className={`spawner-action ${spawner.lastAction}`}>{spawner.lastAction}</span>
            </button>
            <span className="spawner-bars">
              <Meter label="Energy" value={spawner.energy} max={world.config.reproductionEnergy} color="#69d7d0" />
              <Meter label="Health" value={spawner.health} max={world.config.initialHealth} color="#86d87a" />
            </span>
            <span className="spawner-card-stats">
              <span>{spawnerPendingFoods} pending</span>
              <span>alive</span>
              <span>{Math.round(spawnerHitRate(spawner) * 100)}% hit</span>
              <span>{formatSignedPercent(recentAverage)} recent</span>
            </span>
          </div>
          );
        })}
      </div>

      {selectedSpawner ? (
        <div className="spawner-detail">
          <Metric label="Selected" value={`#${selectedSpawner.id} / L${selectedSpawner.lineageId}`} />
          <Metric label="Spawned" value={String(selectedSpawner.spawnedCount)} />
          <Metric label="Resolved" value={String(selectedSpawner.resolvedCount)} />
          <Metric label="Children" value={String(selectedSpawner.children)} />
          <Metric label="Hit rate" value={`${Math.round(spawnerHitRate(selectedSpawner) * 100)}%`} />
          <Metric label="Avg payoff" value={formatSignedPercent(spawnerAveragePayoff(selectedSpawner))} />
          {selectedMetrics ? (
            <>
              <Metric label="Active units" value={String(selectedMetrics.activeUnits)} />
              <Metric label="Active layers" value={String(selectedMetrics.activeLayers)} />
              <Metric label="Active links" value={String(selectedMetrics.activeConnections)} />
              <Metric label="Disabled genes" value={`${selectedMetrics.disabledUnits}u / ${selectedMetrics.disabledConnections}l`} />
              <Metric label="Recurrent links" value={String(selectedMetrics.recurrentConnections)} />
              <Metric label="Skip links" value={String(selectedMetrics.skipConnections)} />
              <Metric label="Mutation std" value={selectedSpawner.genome.mutationStd.toFixed(3)} />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percent = clamp(value / Math.max(1, max), 0, 1) * 100;
  return (
    <span className="spawner-meter">
      <span>
        {label}
        <strong>{value.toFixed(label === "Health" ? 0 : 1)}</strong>
      </span>
      <span className="spawner-meter-track">
        <span style={{ width: `${percent}%`, background: color }} />
      </span>
    </span>
  );
}
