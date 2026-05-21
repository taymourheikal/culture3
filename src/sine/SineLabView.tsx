import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_ROC } from "./marketSignal";
import { getTimelineSampleAt } from "./marketTimeline";
import {
  getVisibleSpawnerFoods,
} from "./spawnerSimulation";
import { drawNoiseChart } from "./charts/noiseChart";
import { drawParameterChart } from "./charts/parameterChart";
import { drawSignalChart, pickSignalChartFood } from "./charts/signalChart";
import { drawTelemetryChart } from "./charts/telemetryChart";
import { formatSignedPercent, formatSlope } from "./charts/format";
import { SineControlsSidebar } from "./SineControlsSidebar";
import { Metric } from "./SineMetric";
import { SpawnerRoster } from "./SpawnerRoster";
import { SpawnerArchitectureModal } from "./SpawnerArchitectureModal";
import { useMarketSimulation } from "./useMarketSimulation";
import { SineViewTabs } from "./SineViewTabs";
import type { SineView } from "./SineApp";

export function SineLabView({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const parameterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedSpawnerIdRef = useRef<number | null>(null);
  const [selectedSpawnerId, setSelectedSpawnerId] = useState<number | null>(null);
  const [inspectedSpawnerId, setInspectedSpawnerId] = useState<number | null>(null);
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
  const inspectedSpawner = useMemo(
    () => spawnerWorld.spawners.find((spawner) => spawner.id === inspectedSpawnerId) ?? null,
    [inspectedSpawnerId, version, spawnerWorld],
  );

  useEffect(() => {
    if (selectedSpawnerId !== null && !selectedSpawner) {
      setSelectedSpawnerId(null);
    }
  }, [selectedSpawnerId, selectedSpawner]);

  useEffect(() => {
    if (inspectedSpawnerId !== null && !inspectedSpawner) {
      setInspectedSpawnerId(null);
    }
  }, [inspectedSpawnerId, inspectedSpawner]);

  const pendingFoods = spawnerWorld.foods.filter((food) => food.status === "pending").length;
  const resolvedFoods = spawnerWorld.foods.length - pendingFoods;

  const reset = () => {
    setSelectedSpawnerId(null);
    setInspectedSpawnerId(null);
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
          onInspect={setInspectedSpawnerId}
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

      <SineControlsSidebar
        settings={settings}
        spawnerConfig={spawnerConfig}
        playing={playing}
        savedGroup={savedGroup}
        sidebarMode={sidebarMode}
        setPlaying={setPlaying}
        setSavedGroup={setSavedGroup}
        setSidebarMode={setSidebarMode}
        updateSetting={updateSetting}
        updateSpawnerConfig={updateSpawnerConfig}
        replaceSpawnerConfig={replaceSpawnerConfig}
        onReset={reset}
      />

      {inspectedSpawner ? <SpawnerArchitectureModal spawner={inspectedSpawner} onClose={() => setInspectedSpawnerId(null)} /> : null}
    </main>
  );
}
