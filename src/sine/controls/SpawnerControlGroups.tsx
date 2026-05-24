import { Save } from "lucide-react";
import { roundForInput } from "../charts/format";
import { saveSpawnerConfigGroup } from "../spawnerSettingsStorage";
import { INPUT_COUNT, OUTPUT_COUNT, type SpawnerConfig } from "../spawnerSimulation";
import { SPAWNER_CONTROL_GROUPS, type SpawnerControlConfig } from "../sineControlGroups";
import { Metric } from "../SineMetric";
import { ControlSlider } from "./ControlSlider";

export function SpawnerControlGroups({
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
