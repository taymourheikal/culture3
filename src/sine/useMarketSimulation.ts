import { useEffect, useRef, useState } from "react";
import type { WaveSettings } from "./marketSignal";
import { applyTimelineSettings } from "./marketTimeline";
import { loadSavedMarketSettings } from "./settingsStorage";
import { loadSavedSpawnerConfig, sanitizeSpawnerConfig } from "./spawnerSettingsStorage";
import type { SpawnerConfig } from "./spawnerSimulation";
import {
  advanceSimulationToTarget,
  createSimulationState,
  MAX_SIMULATION_TICKS_PER_FRAME,
  type MarketSimulationState,
} from "./simulationRuntime";

export function useMarketSimulation() {
  const [settings, setSettings] = useState(loadSavedMarketSettings);
  const [spawnerConfig, setSpawnerConfig] = useState(loadSavedSpawnerConfig);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  const spawnerConfigRef = useRef(spawnerConfig);
  const playingRef = useRef(true);
  const simulationRef = useRef<MarketSimulationState | null>(null);
  const targetTimeRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [version, setVersion] = useState(0);
  const [backlogTicks, setBacklogTicks] = useState(0);

  if (!simulationRef.current) {
    simulationRef.current = createSimulationState(settings, spawnerConfig);
  }

  settingsRef.current = settings;
  spawnerConfigRef.current = spawnerConfig;
  playingRef.current = playing;

  useEffect(() => {
    const frame = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp;
      const elapsed = Math.max(0, (timestamp - previous) / 1000);
      lastFrameRef.current = timestamp;

      if (playingRef.current) {
        targetTimeRef.current += elapsed * settingsRef.current.speed;
        const simulation = simulationRef.current;
        if (simulation) {
          const result = advanceSimulationToTarget(simulation, targetTimeRef.current, MAX_SIMULATION_TICKS_PER_FRAME);
          setBacklogTicks(result.remainingTicks);
          if (result.processedTicks > 0) {
            setTime(simulation.timeline.time);
            setVersion((current) => current + 1);
          }
        }
      }

      animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const updateSetting = <K extends keyof WaveSettings>(key: K, value: WaveSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      const activeSimulation = simulationRef.current;
      if (activeSimulation) applyTimelineSettings(activeSimulation.timeline, next);
      return next;
    });
  };

  const reset = () => {
    const currentSettings = settingsRef.current;
    const currentSpawnerConfig = spawnerConfigRef.current;
    lastFrameRef.current = null;
    targetTimeRef.current = 0;
    simulationRef.current = createSimulationState(currentSettings, currentSpawnerConfig);
    setBacklogTicks(0);
    setTime(0);
    setVersion((current) => current + 1);
  };

  const updateSpawnerConfig = <K extends keyof SpawnerConfig>(key: K, value: SpawnerConfig[K]) => {
    setSpawnerConfig((current) => sanitizeSpawnerConfig({ ...current, [key]: value }));
  };

  const replaceSpawnerConfig = (next: SpawnerConfig) => {
    setSpawnerConfig(sanitizeSpawnerConfig(next));
  };

  return {
    simulation: simulationRef.current,
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
    reset,
  };
}
