import type { WaveSettings } from "./marketSignal";
import type { MarketDataSource, MarketPlaybackSettings, MarketRuntimeConfig } from "./marketRuntimeConfig";
import type { MarketStatsPacket } from "./marketWorkerProtocol";
import type { SpawnerConfig } from "./spawnerSimulation";
import { MarketControlGroups } from "./controls/MarketControlGroups";
import { SpawnerControlGroups } from "./controls/SpawnerControlGroups";

export function SineControlsSidebar({
  settings,
  marketConfig,
  spawnerConfig,
  stats,
  savedGroup,
  sidebarMode,
  setSavedGroup,
  setSidebarMode,
  updateSetting,
  updatePlaybackSetting,
  updateMarketSource,
  replaceMarketConfig,
  updateSpawnerConfig,
  replaceSpawnerConfig,
}: {
  settings: WaveSettings;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  stats?: MarketStatsPacket | null;
  savedGroup: string | null;
  sidebarMode: "market" | "spawners";
  setSavedGroup: (key: string | null) => void;
  setSidebarMode: (mode: "market" | "spawners") => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
  updatePlaybackSetting: <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => void;
  updateMarketSource: (source: MarketDataSource) => void;
  replaceMarketConfig: (config: MarketRuntimeConfig) => void;
  updateSpawnerConfig: (key: keyof SpawnerConfig, value: number) => void;
  replaceSpawnerConfig: (config: SpawnerConfig) => void;
}) {
  return (
    <aside className="sine-controls">
      <div className="sine-control-mode-tabs" aria-label="Simulator parameter menu">
        <button type="button" className={sidebarMode === "market" ? "active" : ""} onClick={() => setSidebarMode("market")}>
          Market
        </button>
        <button type="button" className={sidebarMode === "spawners" ? "active" : ""} onClick={() => setSidebarMode("spawners")}>
          Spawner Agents
        </button>
      </div>

      <div className="sine-control-panel-scroll">
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
            stats={stats}
            savedGroup={savedGroup}
            setSavedGroup={setSavedGroup}
            updateSpawnerConfig={updateSpawnerConfig}
            replaceSpawnerConfig={replaceSpawnerConfig}
          />
        )}
      </div>
    </aside>
  );
}
