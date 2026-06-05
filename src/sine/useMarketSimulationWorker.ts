import { useEffect, useMemo, useRef, useState } from "react";
import type { WaveSettings } from "./marketSignal";
import type { MarketDataSource, MarketPlaybackSettings, MarketRuntimeConfig } from "./marketRuntimeConfig";
import type {
  MarketChartPacket,
  MarketRosterPacket,
  MarketStatsPacket,
  MarketWorkerCommand,
  MarketWorkerMessage,
  SpawnerArchitecturePacket,
  SpawnerInspectionPacket,
  SpawnerUniquenessDetailPacket,
} from "./marketWorkerProtocol";
import { loadSavedMarketRuntimeConfig, sanitizeSettings } from "./settingsStorage";
import { sanitizeMarketRuntimeConfig } from "./marketRuntimeConfig";
import { loadSavedSpawnerConfig, sanitizeSpawnerConfig } from "./spawnerSettingsStorage";
import type { SpawnerConfig } from "./spawnerSimulation";
import { createInspectionRequestStore } from "./hooks/inspectionRequestStore";
import { postSineSnapshot } from "./persistence/sinePersistenceClient";
import { workerCommands } from "./worker/workerCommands";
import { routeMarketWorkerMessage } from "./worker/workerMessageRouter";

export function useMarketSimulationWorker() {
  const initialMarketConfig = useMemo(() => loadSavedMarketRuntimeConfig(), []);
  const initialSettings = initialMarketConfig.generated;
  const initialSpawnerConfig = useMemo(() => loadSavedSpawnerConfig(), []);
  const workerRef = useRef<Worker | null>(null);
  const sessionRef = useRef(1);
  const latestChartPacketRef = useRef<MarketChartPacket | null>(null);
  const hasChartPacketRef = useRef(false);
  const statsRef = useRef<MarketStatsPacket | null>(null);
  const nextInspectionRequestIdRef = useRef(1);
  const inspectionRequestsRef = useRef(createInspectionRequestStore());
  const [hasChartPacket, setHasChartPacket] = useState(false);
  const [chartRevision, setChartRevision] = useState(0);
  const [stats, setStats] = useState<MarketStatsPacket | null>(null);
  const [roster, setRoster] = useState<MarketRosterPacket | null>(null);
  const [architecture, setArchitecture] = useState<SpawnerArchitecturePacket | null>(null);
  const [architectureLoadingId, setArchitectureLoadingId] = useState<number | null>(null);
  const [inspection, setInspection] = useState<SpawnerInspectionPacket | null>(null);
  const [inspectionLoadingId, setInspectionLoadingId] = useState<number | null>(null);
  const [uniquenessDetail, setUniquenessDetail] = useState<SpawnerUniquenessDetailPacket | null>(null);
  const [uniquenessLoadingId, setUniquenessLoadingId] = useState<number | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [error, setError] = useState<string | null>(null);

  statsRef.current = stats;

  useEffect(() => {
    const worker = new Worker(new URL("./marketSimulation.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    const showWorkerError = (message: string) => {
      setError(message);
    };

    worker.addEventListener("message", (event: MessageEvent<MarketWorkerMessage>) => {
      routeMarketWorkerMessage(event.data, sessionRef.current, {
        chart: (packet) => {
          latestChartPacketRef.current = packet;
          if (!hasChartPacketRef.current) {
            hasChartPacketRef.current = true;
            setHasChartPacket(true);
          }
          if (statsRef.current?.runState !== "running") {
            setChartRevision((revision) => revision + 1);
          }
        },
        stats: (packet) => {
          setStats(packet);
        },
        roster: setRoster,
        architecture: (packet) => {
          setArchitecture(packet);
          setArchitectureLoadingId(null);
        },
        spawnerInspection: (packet) => {
          const pending = inspectionRequestsRef.current.resolve(packet);
          if (!pending || pending.updateState) {
            setInspection(packet);
            setInspectionLoadingId(null);
          }
        },
        uniquenessDetail: (packet) => {
          setUniquenessDetail(packet);
          setUniquenessLoadingId(null);
        },
        persistence: (persistencePacketId, packet) => {
          const ackSessionId = packet.sessionId;
          void postPersistencePacket(packet)
            .then(() => {
              post(worker, workerCommands.persistenceAck(ackSessionId, persistencePacketId, true));
              setPersistenceStatus("online");
            })
            .catch(() => {
              post(worker, workerCommands.persistenceAck(ackSessionId, persistencePacketId, false));
              setPersistenceStatus("offline");
            });
        },
        error: setError,
      });
    });
    worker.addEventListener("error", (event) => {
      showWorkerError(event.message || "Simulation worker failed.");
    });
    worker.addEventListener("messageerror", () => {
      showWorkerError("Simulation worker sent a message the UI could not decode.");
    });

    post(worker, workerCommands.reset(sessionRef.current, initialMarketConfig, initialSpawnerConfig));

    return () => {
      inspectionRequestsRef.current.rejectAll(sessionRef.current);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [initialMarketConfig, initialSpawnerConfig]);

  const currentSettings = stats?.settings ?? initialSettings;
  const currentMarketConfig = stats?.pendingMarketConfig ?? stats?.marketConfig ?? initialMarketConfig;
  const currentActiveMarketConfig = stats?.activeMarketConfig ?? stats?.marketConfig ?? initialMarketConfig;
  const currentSpawnerConfig = stats?.pendingSpawnerConfig ?? stats?.spawnerConfig ?? initialSpawnerConfig;
  const currentActiveSpawnerConfig = stats?.activeSpawnerConfig ?? stats?.spawnerConfig ?? initialSpawnerConfig;
  const currentRunState = stats?.runState ?? "idle";
  const currentPlaying = stats?.playing ?? false;

  const send = (command: MarketWorkerCommand) => {
    const worker = workerRef.current;
    if (!worker) return;
    post(worker, command);
  };

  const setPlaying = (updater: (value: boolean) => boolean) => {
    const next = updater(statsRef.current?.playing ?? false);
    setError(null);
    send(next ? workerCommands.start(sessionRef.current) : workerCommands.pause(sessionRef.current));
  };

  const start = () => {
    setError(null);
    send(workerCommands.start(sessionRef.current));
  };

  const pause = () => {
    setError(null);
    send(workerCommands.pause(sessionRef.current));
  };

  const stop = () => {
    setError(null);
    send(workerCommands.stop(sessionRef.current));
  };

  const updateSetting = <K extends keyof WaveSettings>(key: K, value: WaveSettings[K]) => {
    const settings = sanitizeSettings({ ...currentSettings, [key]: value });
    send(workerCommands.setSettings(sessionRef.current, { [key]: settings[key] }));
  };

  const updatePlaybackSetting = <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => {
    const marketConfig = sanitizeMarketRuntimeConfig({
      ...currentMarketConfig,
      playback: { ...currentMarketConfig.playback, [key]: value },
    });
    send(workerCommands.setPlaybackSettings(sessionRef.current, { [key]: marketConfig.playback[key] }));
  };

  const updateMarketSource = (source: MarketDataSource) => {
    const marketConfig = sanitizeMarketRuntimeConfig({ ...currentMarketConfig, source });
    send(workerCommands.setMarketSource(sessionRef.current, marketConfig.source));
  };

  const replaceMarketConfig = (marketConfig: MarketRuntimeConfig) => {
    send(workerCommands.setMarketConfig(sessionRef.current, sanitizeMarketRuntimeConfig(marketConfig)));
  };

  const updateSpawnerConfig = <K extends keyof SpawnerConfig>(key: K, value: SpawnerConfig[K]) => {
    const config = sanitizeSpawnerConfig({ ...currentSpawnerConfig, [key]: value });
    send(workerCommands.setSpawnerConfig(sessionRef.current, { [key]: config[key] }));
  };

  const replaceSpawnerConfig = (spawnerConfig: SpawnerConfig) => {
    send(workerCommands.replaceSpawnerConfig(sessionRef.current, sanitizeSpawnerConfig(spawnerConfig)));
  };

  const requestSpawnerArchitecture = (spawnerId: number) => {
    setArchitectureLoadingId(spawnerId);
    setArchitecture(null);
    send(workerCommands.requestSpawnerArchitecture(sessionRef.current, spawnerId));
  };

  const requestSpawnerInspection = (spawnerId: number, options: { updateState?: boolean } = {}) => {
    const updateState = options.updateState ?? true;
    const requestSessionId = sessionRef.current;
    const requestId = nextInspectionRequestIdRef.current;
    nextInspectionRequestIdRef.current += 1;
    if (updateState) {
      setInspectionLoadingId(spawnerId);
      setInspection(null);
    }
    return new Promise<SpawnerInspectionPacket>((resolve) => {
      const timeout = setTimeout(() => {
        inspectionRequestsRef.current.delete(requestId);
        const packet: SpawnerInspectionPacket = {
          sessionId: requestSessionId,
          requestId,
          spawnerId,
          ok: false,
          payload: null,
          error: "timeout",
        };
        if (updateState) {
          setInspection(packet);
          setInspectionLoadingId(null);
        }
        resolve(packet);
      }, 5000);
      inspectionRequestsRef.current.set(requestId, { resolve, timeout, updateState });
      send(workerCommands.requestSpawnerInspection(requestSessionId, requestId, spawnerId));
    });
  };

  const requestUniquenessDetail = (spawnerId: number) => {
    setUniquenessLoadingId(spawnerId);
    setUniquenessDetail(null);
    send(workerCommands.requestUniquenessDetail(sessionRef.current, spawnerId));
  };

  const setSelectedSpawnerForCharts = (spawnerId: number | null) => {
    send(workerCommands.setSelectedSpawnerForCharts(sessionRef.current, spawnerId));
  };

  const reset = () => {
    inspectionRequestsRef.current.rejectAll(sessionRef.current, "cancelled");
    sessionRef.current += 1;
    latestChartPacketRef.current = null;
    hasChartPacketRef.current = false;
    setHasChartPacket(false);
    setChartRevision(0);
    setStats(null);
    setRoster(null);
    setArchitecture(null);
    setArchitectureLoadingId(null);
    setInspection(null);
    setInspectionLoadingId(null);
    setUniquenessDetail(null);
    setUniquenessLoadingId(null);
    setPersistenceStatus("unknown");
    setError(null);
    send(workerCommands.reset(sessionRef.current, currentMarketConfig, currentSpawnerConfig));
  };

  return {
    latestChartPacketRef,
    chartRevision,
    hasChartPacket,
    stats,
    roster,
    marketConfig: currentMarketConfig,
    activeMarketConfig: currentActiveMarketConfig,
    settings: currentSettings,
    spawnerConfig: currentSpawnerConfig,
    activeSpawnerConfig: currentActiveSpawnerConfig,
    runState: currentRunState,
    persistentSessionId: stats?.persistentSessionId ?? null,
    playing: currentPlaying,
    tick: stats?.tick ?? 0,
    version: stats?.version ?? 0,
    backlogTicks: stats?.backlogTicks ?? 0,
    architecture,
    architectureLoadingId,
    inspection,
    inspectionLoadingId,
    uniquenessDetail,
    uniquenessLoadingId,
    persistenceStatus,
    start,
    pause,
    stop,
    setPlaying,
    updateSetting,
    updatePlaybackSetting,
    updateMarketSource,
    replaceMarketConfig,
    updateSpawnerConfig,
    replaceSpawnerConfig,
    requestSpawnerArchitecture,
    requestSpawnerInspection,
    requestUniquenessDetail,
    setSelectedSpawnerForCharts,
    reset,
    error,
  };
}

function post(worker: Worker, command: MarketWorkerCommand) {
  worker.postMessage(command);
}

async function postPersistencePacket(packet: unknown) {
  await postSineSnapshot(packet);
}
