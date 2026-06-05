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
import { DEFAULT_STRATEGY_MAP_VIEW, findStrategyMapPointAt, type StrategyMapViewOptions } from "./charts/strategyMapChart";
import { SineChartStack } from "./SineChartStack";
import { SineFooterMetrics } from "./SineFooterMetrics";
import { SineHeader } from "./SineHeader";
import { SineRunControls } from "./SineRunControls";
import { SineStrategyMapChart, SineTelemetryCharts, SineTradingPerformanceChart } from "./SineTelemetryCharts";
import { SpawnerUniquenessModal } from "./SpawnerUniquenessModal";
import { RuntimeDiagnosticsModal } from "./RuntimeDiagnosticsModal";
import { VisibleTradeLedgerModal } from "./VisibleTradeLedgerModal";
import {
  SinePopulationHealthPanel,
  SinePopulationCompositionPanel,
  SineRunPerformancePanel,
  SineRuntimeHealthPanel,
  SineSelectedSpawnerPanel,
} from "./SineWorkbenchPanels";
import type { SineView } from "./SineApp";
import type { SpawnerInspectionPayload } from "./marketWorkerProtocol";

export function SineLabView({
  activeView,
  onViewChange,
}: {
  activeView: SineView;
  onViewChange: (view: SineView) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const parameterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tradingPerformanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uniquenessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strategyMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedSpawnerIdRef = useRef<number | null>(null);
  const lastCanvasDrawRef = useRef<{ version: number; renderTick: number; selectedSpawnerId: number | null; strategyMapViewKey: string }>({
    version: -1,
    renderTick: Number.NaN,
    selectedSpawnerId: null,
    strategyMapViewKey: "",
  });
  const [selectedSpawnerId, setSelectedSpawnerId] = useState<number | null>(null);
  const [strategyMapViewOptions, setStrategyMapViewOptions] = useState<StrategyMapViewOptions>(DEFAULT_STRATEGY_MAP_VIEW);
  const [inspectedSpawnerId, setInspectedSpawnerId] = useState<number | null>(null);
  const [uniquenessModalSpawnerId, setUniquenessModalSpawnerId] = useState<number | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [tradeLedgerOpen, setTradeLedgerOpen] = useState(false);
  const [historicalInspection, setHistoricalInspection] = useState<SpawnerInspectionPayload | null>(null);
  const [savedGroup, setSavedGroup] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"market" | "spawners">("market");
  const {
    latestChartPacketRef,
    chartRevision,
    hasChartPacket,
    stats,
    roster,
    marketConfig,
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
  const strategyMapViewKey = `${strategyMapViewOptions.colorMode}:${strategyMapViewOptions.sizeMode}:${strategyMapViewOptions.showCenters ? 1 : 0}:${strategyMapViewOptions.minResolvedTrades}`;

  useSineCanvasRenderer({
    priceCanvasRef: canvasRef,
    noiseCanvasRef,
    parameterCanvasRef,
    telemetryCanvasRef,
    tradingPerformanceCanvasRef,
    uniquenessCanvasRef,
    strategyMapCanvasRef,
    latestChartPacketRef,
    selectedSpawnerIdRef,
    strategyMapViewOptions,
    strategyMapViewKey,
    chartRevision,
    runState,
    selectedSpawnerId,
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
  const marketTick = stats?.marketTick ?? tick;
  const worldTick = stats?.worldTick ?? roster?.tick ?? tick;
  const renderTick = stats?.renderTick ?? worldTick;
  const rosterTick = roster?.tick ?? 0;
  const selectedSpawner = useMemo(
    () => spawners.find((spawner) => spawner.id === selectedSpawnerId) ?? null,
    [selectedSpawnerId, spawners],
  );
  const selectedSpawnerTimeline = latestChartPacketRef.current?.selectedSpawnerTimeline ?? null;

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

  const updateStrategyMapViewOptions = (patch: Partial<StrategyMapViewOptions>) => {
    setStrategyMapViewOptions((current) => ({ ...current, ...patch }));
  };

  const selectStrategyMapPoint = (clientX: number, clientY: number) => {
    const canvas = strategyMapCanvasRef.current;
    const packet = latestChartPacketRef.current;
    if (!canvas || !packet) return;
    const point = findStrategyMapPointAt(canvas, packet.strategyMap, strategyMapViewOptions, clientX, clientY);
    if (point) setSelectedSpawnerId(point.spawnerId);
  };

  const inspectSpawner = (spawnerId: number) => {
    setHistoricalInspection(null);
    setSelectedSpawnerId(spawnerId);
    setInspectedSpawnerId(spawnerId);
    void requestSpawnerInspection(spawnerId);
  };

  const openUniqueness = (spawnerId: number) => {
    setSelectedSpawnerId(spawnerId);
    setUniquenessModalSpawnerId(spawnerId);
    requestUniquenessDetail(spawnerId);
  };

  const inspectHistoricalSpawner = (payload: SpawnerInspectionPayload) => {
    setHistoricalInspection(payload);
    setInspectedSpawnerId(payload.spawnerId);
  };

  if (!hasChartPacket || !stats || !roster) {
    return (
      <main className="sine-shell sine-workbench loading">
        <SineHeader activeView={activeView} currentSignal={currentSignal} showReadout={false} onViewChange={onViewChange} />
        <SineRunControls playing={playing} runState={runState} onPlay={start} onPause={pause} onStop={stop} onReset={resetSimulation} />
        <section className="sine-stage sine-workbench-center">
          <div className="sine-worker-state">{error ?? "Starting simulation worker..."}</div>
        </section>
        <aside className="sine-workbench-left">
          <SineControlsSidebar
            settings={settings}
            marketConfig={marketConfig}
            spawnerConfig={spawnerConfig}
            stats={stats}
            savedGroup={savedGroup}
            sidebarMode={sidebarMode}
            setSavedGroup={setSavedGroup}
            setSidebarMode={setSidebarMode}
            updateSetting={updateSetting}
            updatePlaybackSetting={updatePlaybackSetting}
            updateMarketSource={updateMarketSource}
            replaceMarketConfig={replaceMarketConfig}
            updateSpawnerConfig={updateSpawnerConfig}
            replaceSpawnerConfig={replaceSpawnerConfig}
          />
        </aside>
      </main>
    );
  }

  return (
    <main className="sine-shell sine-workbench">
      <SineHeader activeView={activeView} currentSignal={currentSignal} showReadout onViewChange={onViewChange} />
      {error ? <div className="sine-error-banner">{error}</div> : null}
      <SineRunControls playing={playing} runState={runState} onPlay={start} onPause={pause} onStop={stop} onReset={reset} />

      <aside className="sine-workbench-left">
        <SineControlsSidebar
          settings={settings}
          marketConfig={marketConfig}
          spawnerConfig={spawnerConfig}
          stats={stats}
          savedGroup={savedGroup}
          sidebarMode={sidebarMode}
          setSavedGroup={setSavedGroup}
          setSidebarMode={setSidebarMode}
          updateSetting={updateSetting}
          updatePlaybackSetting={updatePlaybackSetting}
          updateMarketSource={updateMarketSource}
          replaceMarketConfig={replaceMarketConfig}
          updateSpawnerConfig={updateSpawnerConfig}
          replaceSpawnerConfig={replaceSpawnerConfig}
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
          onOpenUniqueness={openUniqueness}
          showSelectedDetail={false}
        />
      </aside>

      <section className="sine-stage sine-workbench-center">
        <SineChartStack
          marketConfig={marketConfig}
          currentSignal={currentSignal}
          currentNoise={currentNoise}
          priceCanvasRef={canvasRef}
          noiseCanvasRef={noiseCanvasRef}
          parameterCanvasRef={parameterCanvasRef}
          onSignalChartClick={selectFoodAtPoint}
          onOpenTradeLedger={() => setTradeLedgerOpen(true)}
        />

        <SineTradingPerformanceChart canvasRef={tradingPerformanceCanvasRef} />
        <SineStrategyMapChart
          canvasRef={strategyMapCanvasRef}
          viewOptions={strategyMapViewOptions}
          onChangeViewOptions={updateStrategyMapViewOptions}
          onCanvasClick={selectStrategyMapPoint}
        />

        <SineSelectedSpawnerPanel
          selectedSpawner={selectedSpawner}
          selectedSpawnerId={selectedSpawnerId}
          selectedSpawnerTimeline={selectedSpawnerTimeline}
          strategyMap={latestChartPacketRef.current?.strategyMap ?? null}
          worldTick={worldTick}
          rosterTick={rosterTick}
          energyMax={stats.currentReproductionEnergyRequirement}
          healthMax={activeSpawnerConfig.initialHealth}
          onInspect={inspectSpawner}
          onOpenUniqueness={openUniqueness}
        />
      </section>

      <aside className="sine-workbench-right">
        <SinePopulationHealthPanel stats={stats} />
        <SinePopulationCompositionPanel spawners={spawners} tick={rosterTick} totalSpawnerCount={stats.spawnerCount} />
        <SineRunPerformancePanel stats={stats} />
        <SineRuntimeHealthPanel
          stats={stats}
          backlogTicks={backlogTicks}
          persistenceStatus={persistenceStatus}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
        <SineTelemetryCharts
          telemetryCanvasRef={telemetryCanvasRef}
          uniquenessCanvasRef={uniquenessCanvasRef}
        />
      </aside>

      <section className="sine-workbench-history">
        <SineHistoricalInspector activeSessionId={persistentSessionId} activeRunState={runState} onLoad={inspectHistoricalSpawner} />
      </section>

      <section className="sine-workbench-footer">
        <SineFooterMetrics
          stats={stats}
          settings={settings}
          marketTick={marketTick}
          worldTick={worldTick}
          renderTick={renderTick}
          pendingFoods={pendingFoods}
          resolvedFoods={resolvedFoods}
          backlogTicks={backlogTicks}
          persistenceStatus={persistenceStatus}
        />
      </section>

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

      {uniquenessModalSpawnerId !== null ? (
        <SpawnerUniquenessModal
          spawnerId={uniquenessModalSpawnerId}
          detail={uniquenessDetail?.spawnerId === uniquenessModalSpawnerId ? uniquenessDetail : null}
          loading={uniquenessLoadingId === uniquenessModalSpawnerId}
          onClose={() => setUniquenessModalSpawnerId(null)}
        />
      ) : null}

      {diagnosticsOpen ? (
        <RuntimeDiagnosticsModal
          stats={stats}
          backlogTicks={backlogTicks}
          persistenceStatus={persistenceStatus}
          persistentSessionId={persistentSessionId}
          onClose={() => setDiagnosticsOpen(false)}
        />
      ) : null}

      {tradeLedgerOpen ? (
        <VisibleTradeLedgerModal
          foods={latestChartPacketRef.current?.visibleFoods ?? []}
          onSelectCreator={setSelectedSpawnerId}
          onClose={() => setTradeLedgerOpen(false)}
        />
      ) : null}
    </main>
  );
}
