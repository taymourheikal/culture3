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
      const message = event.data;
      if (message.type === "chart") {
        if (message.packet.sessionId !== sessionRef.current) return;
        latestChartPacketRef.current = message.packet;
        setError(null);
        if (!hasChartPacketRef.current) {
          hasChartPacketRef.current = true;
          setHasChartPacket(true);
        }
      } else if (message.type === "stats") {
        if (message.packet.sessionId !== sessionRef.current) return;
        setError(null);
        setStats(message.packet);
      } else if (message.type === "roster") {
        if (message.packet.sessionId !== sessionRef.current) return;
        setRoster(message.packet);
      } else if (message.type === "architecture") {
        if (message.packet.sessionId !== sessionRef.current) return;
        setArchitecture(message.packet);
        setArchitectureLoadingId(null);
      } else if (message.type === "spawnerInspection") {
        if (message.packet.sessionId !== sessionRef.current) return;
        const pending = inspectionRequestsRef.current.resolve(message.packet);
        if (!pending || pending.updateState) {
          setInspection(message.packet);
          setInspectionLoadingId(null);
        }
      } else if (message.type === "uniquenessDetail") {
        if (message.packet.sessionId !== sessionRef.current) return;
        setUniquenessDetail(message.packet);
        setUniquenessLoadingId(null);
      } else if (message.type === "persistence") {
        if (message.packet.sessionId !== sessionRef.current) return;
        const ackSessionId = message.packet.sessionId;
        const ackPacketId = message.persistencePacketId;
        void postPersistencePacket(message.packet)
          .then(() => {
            post(worker, {
              type: "persistenceAck",
              sessionId: ackSessionId,
              persistencePacketId: ackPacketId,
              ok: true,
            });
            setPersistenceStatus("online");
          })
          .catch(() => {
            post(worker, {
              type: "persistenceAck",
              sessionId: ackSessionId,
              persistencePacketId: ackPacketId,
              ok: false,
            });
            setPersistenceStatus("offline");
          });
      } else if (message.type === "error") {
        if (message.sessionId !== sessionRef.current) return;
        setError(message.message);
      }
    });
    worker.addEventListener("error", (event) => {
      showWorkerError(event.message || "Simulation worker failed.");
    });
    worker.addEventListener("messageerror", () => {
      showWorkerError("Simulation worker sent a message the UI could not decode.");
    });

    post(worker, {
      type: "reset",
      sessionId: sessionRef.current,
      marketConfig: initialMarketConfig,
      spawnerConfig: initialSpawnerConfig,
    });

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
    send({ type: next ? "start" : "pause", sessionId: sessionRef.current });
  };

  const start = () => {
    send({ type: "start", sessionId: sessionRef.current });
  };

  const pause = () => {
    send({ type: "pause", sessionId: sessionRef.current });
  };

  const stop = () => {
    send({ type: "stop", sessionId: sessionRef.current });
  };

  const updateSetting = <K extends keyof WaveSettings>(key: K, value: WaveSettings[K]) => {
    const settings = sanitizeSettings({ ...currentSettings, [key]: value });
    send({ type: "setSettings", sessionId: sessionRef.current, patch: { [key]: settings[key] } });
  };

  const updatePlaybackSetting = <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => {
    const marketConfig = sanitizeMarketRuntimeConfig({
      ...currentMarketConfig,
      playback: { ...currentMarketConfig.playback, [key]: value },
    });
    send({ type: "setPlaybackSettings", sessionId: sessionRef.current, patch: { [key]: marketConfig.playback[key] } });
  };

  const updateMarketSource = (source: MarketDataSource) => {
    const marketConfig = sanitizeMarketRuntimeConfig({ ...currentMarketConfig, source });
    send({ type: "setMarketSource", sessionId: sessionRef.current, source: marketConfig.source });
  };

  const replaceMarketConfig = (marketConfig: MarketRuntimeConfig) => {
    send({ type: "setMarketConfig", sessionId: sessionRef.current, patch: sanitizeMarketRuntimeConfig(marketConfig) });
  };

  const updateSpawnerConfig = <K extends keyof SpawnerConfig>(key: K, value: SpawnerConfig[K]) => {
    const config = sanitizeSpawnerConfig({ ...currentSpawnerConfig, [key]: value });
    send({ type: "setSpawnerConfig", sessionId: sessionRef.current, patch: { [key]: config[key] } });
  };

  const replaceSpawnerConfig = (spawnerConfig: SpawnerConfig) => {
    send({ type: "replaceSpawnerConfig", sessionId: sessionRef.current, spawnerConfig: sanitizeSpawnerConfig(spawnerConfig) });
  };

  const requestSpawnerArchitecture = (spawnerId: number) => {
    setArchitectureLoadingId(spawnerId);
    setArchitecture(null);
    send({ type: "requestSpawnerArchitecture", sessionId: sessionRef.current, spawnerId });
  };

  const requestSpawnerInspection = (spawnerId: number, options: { updateState?: boolean } = {}) => {
    const updateState = options.updateState ?? true;
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
          sessionId: sessionRef.current,
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
      send({ type: "requestSpawnerInspection", sessionId: sessionRef.current, requestId, spawnerId });
    });
  };

  const requestUniquenessDetail = (spawnerId: number) => {
    setUniquenessLoadingId(spawnerId);
    setUniquenessDetail(null);
    send({ type: "requestUniquenessDetail", sessionId: sessionRef.current, spawnerId });
  };

  const setSelectedSpawnerForCharts = (spawnerId: number | null) => {
    send({ type: "setSelectedSpawnerForCharts", sessionId: sessionRef.current, spawnerId });
  };

  const reset = () => {
    sessionRef.current += 1;
    latestChartPacketRef.current = null;
    hasChartPacketRef.current = false;
    setHasChartPacket(false);
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
    send({
      type: "reset",
      sessionId: sessionRef.current,
      marketConfig: currentMarketConfig,
      spawnerConfig: currentSpawnerConfig,
    });
  };

  return {
    latestChartPacketRef,
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
