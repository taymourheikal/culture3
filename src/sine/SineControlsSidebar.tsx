import { Pause, Play, RotateCcw, Square } from "lucide-react";
import type { WaveSettings } from "./marketSignal";
import type { MarketDataSource, MarketPlaybackSettings, MarketRuntimeConfig } from "./marketRuntimeConfig";
import type { SpawnerConfig } from "./spawnerSimulation";
import { MarketControlGroups } from "./controls/MarketControlGroups";
import { SpawnerControlGroups } from "./controls/SpawnerControlGroups";

export function SineControlsSidebar({
  settings,
  marketConfig,
  spawnerConfig,
  playing,
  runState,
  savedGroup,
  sidebarMode,
  onPlay,
  onPause,
  onStop,
  setSavedGroup,
  setSidebarMode,
  updateSetting,
  updatePlaybackSetting,
  updateMarketSource,
  replaceMarketConfig,
  updateSpawnerConfig,
  replaceSpawnerConfig,
  onReset,
}: {
  settings: WaveSettings;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  playing: boolean;
  runState: "idle" | "running" | "paused" | "stopped";
  savedGroup: string | null;
  sidebarMode: "market" | "spawners";
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  setSavedGroup: (key: string | null) => void;
  setSidebarMode: (mode: "market" | "spawners") => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
  updatePlaybackSetting: <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => void;
  updateMarketSource: (source: MarketDataSource) => void;
  replaceMarketConfig: (config: MarketRuntimeConfig) => void;
  updateSpawnerConfig: (key: keyof SpawnerConfig, value: number) => void;
  replaceSpawnerConfig: (config: SpawnerConfig) => void;
  onReset: () => void;
}) {
  return (
    <aside className="sine-controls">
      <div className="sine-control-actions">
        <button type="button" className="sine-button primary" onClick={onPlay} disabled={playing}>
          <Play size={17} />
          {runState === "paused" ? "Resume" : "Play"}
        </button>
        <button type="button" className="sine-button" onClick={onPause} disabled={runState !== "running"}>
          <Pause size={17} />
          Pause
        </button>
        <button type="button" className="sine-button" onClick={onStop} disabled={runState !== "running" && runState !== "paused"}>
          <Square size={15} />
          Stop
        </button>
        <button type="button" className="sine-button" onClick={onReset}>
          <RotateCcw size={17} />
          New Run
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
        <MarketControlGroups
          settings={settings}
          marketConfig={marketConfig}
          savedGroup={savedGroup}
          setSavedGroup={setSavedGroup}
          updateSetting={updateSetting}
          updatePlaybackSetting={updatePlaybackSetting}
          updateMarketSource={updateMarketSource}
          replaceMarketConfig={replaceMarketConfig}
        />
      ) : (
        <SpawnerControlGroups
          spawnerConfig={spawnerConfig}
          savedGroup={savedGroup}
          setSavedGroup={setSavedGroup}
          updateSpawnerConfig={updateSpawnerConfig}
          replaceSpawnerConfig={replaceSpawnerConfig}
        />
      )}
    </aside>
  );
}
