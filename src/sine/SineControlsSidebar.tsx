import { CircleHelp, Pause, Play, RotateCcw, Save } from "lucide-react";
import { clamp } from "./charts/canvas";
import { roundForInput } from "./charts/format";
import type { WaveSettings } from "./marketSignal";
import { saveMarketSettingsGroup } from "./settingsStorage";
import { saveSpawnerConfigGroup } from "./spawnerSettingsStorage";
import { INPUT_COUNT, OUTPUT_COUNT, type SpawnerConfig } from "./spawnerSimulation";
import { CONTROL_GROUPS, SPAWNER_CONTROL_GROUPS, type ControlConfig, type SpawnerControlConfig } from "./sineControlGroups";
import { Metric } from "./SineMetric";

export function SineControlsSidebar({
  settings,
  spawnerConfig,
  playing,
  savedGroup,
  sidebarMode,
  setPlaying,
  setSavedGroup,
  setSidebarMode,
  updateSetting,
  updateSpawnerConfig,
  replaceSpawnerConfig,
  onReset,
}: {
  settings: WaveSettings;
  spawnerConfig: SpawnerConfig;
  playing: boolean;
  savedGroup: string | null;
  sidebarMode: "market" | "spawners";
  setPlaying: (updater: (value: boolean) => boolean) => void;
  setSavedGroup: (key: string | null) => void;
  setSidebarMode: (mode: "market" | "spawners") => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
  updateSpawnerConfig: (key: keyof SpawnerConfig, value: number) => void;
  replaceSpawnerConfig: (config: SpawnerConfig) => void;
  onReset: () => void;
}) {
  return (
    <aside className="sine-controls">
      <div className="sine-control-actions">
        <button type="button" className="sine-button primary" onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="sine-button" onClick={onReset}>
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
        <MarketControlGroups settings={settings} savedGroup={savedGroup} setSavedGroup={setSavedGroup} updateSetting={updateSetting} />
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

function MarketControlGroups({
  settings,
  savedGroup,
  setSavedGroup,
  updateSetting,
}: {
  settings: WaveSettings;
  savedGroup: string | null;
  setSavedGroup: (key: string | null) => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
}) {
  return (
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
  );
}

function SpawnerControlGroups({
  spawnerConfig,
  savedGroup,
  setSavedGroup,
  updateSpawnerConfig,
  replaceSpawnerConfig,
}: {
  spawnerConfig: SpawnerConfig;
  savedGroup: string | null;
  setSavedGroup: (key: string | null) => void;
  updateSpawnerConfig: (key: keyof SpawnerConfig, value: number) => void;
  replaceSpawnerConfig: (config: SpawnerConfig) => void;
}) {
  return (
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
  );
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
