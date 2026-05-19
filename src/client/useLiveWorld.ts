import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import { persistEvents, persistSnapshot } from "./persistence";
import { pickAgent, renderWorld } from "../render/canvasRenderer";
import { createRng, type Rng } from "../sim/rng";
import type { SimulationParameters, WorldState } from "../sim/types";
import { createSnapshot, createWorld, stepWorld } from "../sim/world";
import type { AppMode } from "./AppModeTabs";
import type { PopulationHistoryPoint } from "./PopulationGraph";

type UiStats = {
  tick: number;
  seconds: number;
  population: number;
  food: number;
  maxGeneration: number;
  births: number;
  deaths: number;
};

export function useLiveWorld(parameters: SimulationParameters, appMode: AppMode) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  if (!worldRef.current) {
    worldRef.current = createWorld(parameters.runtime.initialSeed, parameters);
  }
  if (!rngRef.current) {
    rngRef.current = createRng(parameters.runtime.initialSeed + parameters.runtime.rngOffset);
  }

  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);
  const lastPersistRef = useRef<number>(0);
  const saveInFlightRef = useRef(false);
  const persistedBirthIndexRef = useRef<number>(0);
  const persistedDeathIndexRef = useRef<number>(0);
  const [runKey, setRunKey] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(parameters.runtime.defaultSpeed);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [persistStatus, setPersistStatus] = useState("Waiting for first save");
  const [stats, setStats] = useState<UiStats>(() => buildStats(getWorld(worldRef)));
  const [populationHistory, setPopulationHistory] = useState<PopulationHistoryPoint[]>(() => [buildHistoryPoint(getWorld(worldRef))]);

  const selectedAgent = useMemo(
    () => getWorld(worldRef).agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [selectedAgentId, stats.tick, runKey],
  );
  const lineages = useMemo(() => Object.values(getWorld(worldRef).lineages), [stats.tick, runKey]);
  const selectedLineage = selectedAgent ? getWorld(worldRef).lineages[selectedAgent.lineageId] : undefined;

  useEffect(() => {
    if (appMode !== "live") return;
    let frame = 0;

    const animate = async (timestamp: number) => {
      const world = getWorld(worldRef);
      const rng = getRng(rngRef);
      const canvas = canvasRef.current;
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const runtime = world.parameters.runtime;
      const elapsed = Math.min(runtime.maxFrameElapsed, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      if (running) {
        accumulatorRef.current += elapsed * speed;
        const tickLength = 1 / world.config.tickRate;
        let steps = 0;
        while (accumulatorRef.current >= tickLength && steps < runtime.maxStepsPerFrame) {
          stepWorld(world, rng);
          accumulatorRef.current -= tickLength;
          steps += 1;
        }
      }

      if (canvas) {
        renderWorld(canvas, world, selectedAgentId);
      }

      if (timestamp - lastPersistRef.current > runtime.autosaveIntervalMs) {
        lastPersistRef.current = timestamp;
        void saveWorld();
      }

      if (Math.floor(timestamp / runtime.statsRefreshMs) !== Math.floor((timestamp - elapsed * 1000) / runtime.statsRefreshMs)) {
        setStats(buildStats(world));
        setPopulationHistory((history) => appendHistory(history, buildHistoryPoint(world)));
        if (selectedAgentId && !world.agents.some((agent) => agent.id === selectedAgentId)) {
          setSelectedAgentId(null);
        }
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [appMode, running, selectedAgentId, speed]);

  const resetWorld = () => {
    const seed = Math.floor(Date.now() % 1_000_000);
    worldRef.current = createWorld(seed, parameters);
    rngRef.current = createRng(seed + parameters.runtime.rngOffset);
    accumulatorRef.current = 0;
    lastPersistRef.current = 0;
    saveInFlightRef.current = false;
    persistedBirthIndexRef.current = 0;
    persistedDeathIndexRef.current = 0;
    setRunKey((value) => value + 1);
    setSelectedAgentId(null);
    setSpeed(parameters.runtime.defaultSpeed);
    setStats(buildStats(getWorld(worldRef)));
    setPopulationHistory([buildHistoryPoint(getWorld(worldRef))]);
    setPersistStatus("New world started");
  };

  const saveWorld = async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      const world = getWorld(worldRef);
      const worldId = world.worldId;
      const birthStart = persistedBirthIndexRef.current;
      const deathStart = persistedDeathIndexRef.current;
      const births = world.birthEvents.slice(birthStart);
      const deaths = world.deathEvents.slice(deathStart);
      const snapshot = createSnapshot(world);
      const eventResult = await persistEvents(worldId, births, deaths);
      if (eventResult.ok && getWorld(worldRef).worldId === worldId) {
        persistedBirthIndexRef.current = Math.max(persistedBirthIndexRef.current, birthStart + births.length);
        persistedDeathIndexRef.current = Math.max(persistedDeathIndexRef.current, deathStart + deaths.length);
      }
      const snapshotResult = await persistSnapshot(worldId, snapshot);
      if (getWorld(worldRef).worldId === worldId) {
        if (snapshotResult.ok && eventResult.ok) {
          setPersistStatus(`Saved tick ${snapshot.tick}`);
        } else {
          setPersistStatus(eventResult.ok ? snapshotResult.message : eventResult.message);
        }
      }
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const handleCanvasClick = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const agent = pickAgent(canvas, getWorld(worldRef), event.clientX, event.clientY);
    setSelectedAgentId(agent?.id ?? null);
  };

  return {
    canvasRef,
    running,
    setRunning,
    speed,
    setSpeed,
    resetWorld,
    selectedAgent,
    selectedLineage,
    lineages,
    persistStatus,
    stats,
    populationHistory,
    handleCanvasClick,
  };
}

function buildStats(world: WorldState): UiStats {
  const lineages = Object.values(world.lineages);
  return {
    tick: world.tick,
    seconds: world.tick / world.config.tickRate,
    population: world.agents.length,
    food: world.food.length,
    maxGeneration: lineages.reduce((max, lineage) => Math.max(max, lineage.maxGeneration), 0),
    births: world.birthEvents.length,
    deaths: world.deathEvents.length,
  };
}

function buildHistoryPoint(world: WorldState): PopulationHistoryPoint {
  return {
    tick: world.tick,
    food: world.food.length,
    lineages: Object.fromEntries(Object.values(world.lineages).map((lineage) => [lineage.id, lineage.currentPopulation])),
  };
}

function appendHistory(history: PopulationHistoryPoint[], point: PopulationHistoryPoint) {
  const last = history[history.length - 1];
  if (last?.tick === point.tick) return history;
  return [...history, point];
}

function getWorld(ref: MutableRefObject<WorldState | null>) {
  if (!ref.current) {
    throw new Error("World has not been initialized");
  }
  return ref.current;
}

function getRng(ref: MutableRefObject<Rng | null>) {
  if (!ref.current) {
    throw new Error("RNG has not been initialized");
  }
  return ref.current;
}
