import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_ROC } from "./marketSignal";
import { pickSignalChartFood } from "./charts/signalChart";
import { SineControlsSidebar } from "./SineControlsSidebar";
import { SpawnerRoster } from "./SpawnerRoster";
import { SpawnerArchitectureModal } from "./SpawnerArchitectureModal";
import { useMarketSimulationWorker } from "./useMarketSimulationWorker";
import { SineHistoricalInspector } from "./SineHistoricalInspector";
import { useLiveSpawnerInspector } from "./hooks/useLiveSpawnerInspector";
import { useSineCanvasRenderer } from "./hooks/useSineCanvasRenderer";
import { SineChartStack } from "./SineChartStack";
import { SineFooterMetrics } from "./SineFooterMetrics";
import { SineHeader } from "./SineHeader";
import { SineTelemetryCharts } from "./SineTelemetryCharts";
import type { SineView } from "./SineApp";
import type { SpawnerInspectionPayload } from "./marketWorkerProtocol";

export function SineLabView({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const parameterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uniquenessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedSpawnerIdRef = useRef<number | null>(null);
  const lastCanvasDrawRef = useRef<{ version: number; renderTick: number; selectedSpawnerId: number | null }>({
    version: -1,
    renderTick: Number.NaN,
    selectedSpawnerId: null,
  });
  const [selectedSpawnerId, setSelectedSpawnerId] = useState<number | null>(null);
  const [inspectedSpawnerId, setInspectedSpawnerId] = useState<number | null>(null);
  const [historicalInspection, setHistoricalInspection] = useState<SpawnerInspectionPayload | null>(null);
  const [savedGroup, setSavedGroup] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"market" | "spawners">("market");
  const {
    latestChartPacketRef,
    hasChartPacket,
    stats,
    roster,
    marketConfig,
    activeMarketConfig,
    settings,
    spawnerConfig,
    activeSpawnerConfig,
    runState,
    persistentSessionId,
    playing,
    tick,
    backlogTicks,
    start,
    pause,
    stop,
    updateSetting,
    updatePlaybackSetting,
    updateMarketSource,
    replaceMarketConfig,
    updateSpawnerConfig,
    replaceSpawnerConfig,
    reset: resetSimulation,
    inspection,
    inspectionLoadingId,
    uniquenessDetail,
    uniquenessLoadingId,
    persistenceStatus,
    requestSpawnerInspection,
    requestUniquenessDetail,
    setSelectedSpawnerForCharts,
    error,
  } = useMarketSimulationWorker();

  selectedSpawnerIdRef.current = selectedSpawnerId;

  useSineCanvasRenderer({
    priceCanvasRef: canvasRef,
    noiseCanvasRef,
    parameterCanvasRef,
    telemetryCanvasRef,
    uniquenessCanvasRef,
    latestChartPacketRef,
    selectedSpawnerIdRef,
    lastCanvasDrawRef,
  });
  useLiveSpawnerInspector(requestSpawnerInspection);

  useEffect(() => {
    setSelectedSpawnerForCharts(selectedSpawnerId);
  }, [selectedSpawnerId]);

  const currentSignal = stats?.currentSignal ?? BASE_ROC;
  const currentNoise = stats?.currentNoise ?? 0;
  const visibleFoods = latestChartPacketRef.current?.visibleFoods.length ?? 0;
  const spawners = roster?.spawners ?? [];
  const rosterTick = roster?.tick ?? 0;
  const selectedSpawner = useMemo(
    () => spawners.find((spawner) => spawner.id === selectedSpawnerId) ?? null,
    [selectedSpawnerId, spawners],
  );

  useEffect(() => {
    if (
      !historicalInspection &&
      inspectedSpawnerId !== null &&
      inspection?.spawnerId === inspectedSpawnerId &&
      !inspection.payload &&
      inspectionLoadingId === null
    ) {
      setInspectedSpawnerId(null);
    }
  }, [historicalInspection, inspection, inspectionLoadingId, inspectedSpawnerId]);

  const pendingFoods = stats?.pendingFoods ?? 0;
  const resolvedFoods = stats?.resolvedFoods ?? 0;

  const reset = () => {
    setSelectedSpawnerId(null);
    setInspectedSpawnerId(null);
    resetSimulation();
  };

  const selectFoodAtPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const packet = latestChartPacketRef.current;
    if (!canvas || !packet) return;
    const pickedFood = pickSignalChartFood(canvas, packet, clientX, clientY);
    if (pickedFood) {
      setSelectedSpawnerId(pickedFood.creatorSpawnerId);
    }
  };

  const inspectSpawner = (spawnerId: number) => {
    setHistoricalInspection(null);
    setSelectedSpawnerId(spawnerId);
    setInspectedSpawnerId(spawnerId);
    void requestSpawnerInspection(spawnerId);
  };

  const inspectHistoricalSpawner = (payload: SpawnerInspectionPayload) => {
    setHistoricalInspection(payload);
    setInspectedSpawnerId(payload.spawnerId);
  };

  if (!hasChartPacket || !stats || !roster) {
    return (
      <main className="sine-shell">
        <section className="sine-stage">
          <SineHeader activeView={activeView} currentSignal={currentSignal} showReadout={false} onViewChange={onViewChange} />
          <div className="sine-worker-state">{error ?? "Starting simulation worker..."}</div>
        </section>
        <SineControlsSidebar
          settings={settings}
          marketConfig={marketConfig}
          spawnerConfig={spawnerConfig}
          stats={stats}
          playing={playing}
          runState={runState}
          savedGroup={savedGroup}
          sidebarMode={sidebarMode}
          onPlay={start}
          onPause={pause}
          onStop={stop}
          setSavedGroup={setSavedGroup}
          setSidebarMode={setSidebarMode}
          updateSetting={updateSetting}
          updatePlaybackSetting={updatePlaybackSetting}
          updateMarketSource={updateMarketSource}
          replaceMarketConfig={replaceMarketConfig}
          updateSpawnerConfig={updateSpawnerConfig}
          replaceSpawnerConfig={replaceSpawnerConfig}
          onReset={resetSimulation}
        />
      </main>
    );
  }

  return (
    <main className="sine-shell">
      <section className="sine-stage">
        <SineHeader activeView={activeView} currentSignal={currentSignal} showReadout onViewChange={onViewChange} />
        {error ? <div className="sine-error-banner">{error}</div> : null}

        <SineChartStack
          activeMarketConfig={activeMarketConfig}
          currentSignal={currentSignal}
          currentNoise={currentNoise}
          priceCanvasRef={canvasRef}
          noiseCanvasRef={noiseCanvasRef}
          parameterCanvasRef={parameterCanvasRef}
          onSignalChartClick={selectFoodAtPoint}
        />

        <SpawnerRoster
          spawners={spawners}
          totalSpawnerCount={stats.spawnerCount}
          tick={rosterTick}
          pendingFoods={pendingFoods}
          totalWins={stats.totalWins}
          totalLosses={stats.totalLosses}
          visibleFoods={visibleFoods}
          energyMax={stats.currentReproductionEnergyRequirement}
          healthMax={activeSpawnerConfig.initialHealth}
          recentDeathEvents={roster.recentDeathEvents}
          selectedSpawner={selectedSpawner}
          selectedSpawnerId={selectedSpawnerId}
          uniquenessDetail={uniquenessDetail}
          uniquenessLoadingId={uniquenessLoadingId}
          onSelect={setSelectedSpawnerId}
          onInspect={inspectSpawner}
          onInspectById={inspectSpawner}
          onRequestUniqueness={requestUniquenessDetail}
        />

        <SineTelemetryCharts telemetryCanvasRef={telemetryCanvasRef} uniquenessCanvasRef={uniquenessCanvasRef} />

        <SineHistoricalInspector activeSessionId={persistentSessionId} activeRunState={runState} onLoad={inspectHistoricalSpawner} />

        <SineFooterMetrics
          stats={stats}
          settings={settings}
          tick={tick}
          pendingFoods={pendingFoods}
          resolvedFoods={resolvedFoods}
          backlogTicks={backlogTicks}
          persistenceStatus={persistenceStatus}
        />
      </section>

      <SineControlsSidebar
        settings={settings}
        marketConfig={marketConfig}
        spawnerConfig={spawnerConfig}
        stats={stats}
        playing={playing}
        runState={runState}
        savedGroup={savedGroup}
        sidebarMode={sidebarMode}
        onPlay={start}
        onPause={pause}
        onStop={stop}
        setSavedGroup={setSavedGroup}
        setSidebarMode={setSidebarMode}
        updateSetting={updateSetting}
        updatePlaybackSetting={updatePlaybackSetting}
        updateMarketSource={updateMarketSource}
        replaceMarketConfig={replaceMarketConfig}
        updateSpawnerConfig={updateSpawnerConfig}
        replaceSpawnerConfig={replaceSpawnerConfig}
        onReset={reset}
      />

      {inspectedSpawnerId !== null ? (
        <SpawnerArchitectureModal
          spawnerId={inspectedSpawnerId}
          spawner={
            historicalInspection?.spawnerId === inspectedSpawnerId
              ? historicalInspection.spawner
              : inspection?.spawnerId === inspectedSpawnerId
                ? inspection.payload?.spawner ?? null
                : null
          }
          loading={!historicalInspection && inspectionLoadingId === inspectedSpawnerId}
          modeLabel={historicalInspection ? "Historical RNN Inspector" : "RNN Architecture Inspector"}
          uniqueness={
            historicalInspection?.spawnerId === inspectedSpawnerId
              ? historicalInspection.uniqueness
              : inspection?.spawnerId === inspectedSpawnerId
                ? inspection.payload?.uniqueness ?? null
                : null
          }
          onClose={() => {
            setInspectedSpawnerId(null);
            setHistoricalInspection(null);
          }}
        />
      ) : null}
    </main>
  );
}
