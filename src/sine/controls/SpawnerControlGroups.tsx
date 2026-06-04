import { roundForInput } from "../charts/format";
import type { MarketStatsPacket } from "../marketWorkerProtocol";
import { saveSpawnerConfigGroup } from "../spawnerSettingsStorage";
import { INPUT_COUNT, OUTPUT_COUNT, type SpawnerConfig } from "../spawnerSimulation";
import { SPAWNER_CONTROL_GROUPS, type SpawnerControlConfig } from "../sineControlGroups";
import { Metric } from "../SineMetric";
import { ControlGroupSection } from "./ControlGroupSection";
import { NumberControlGroups } from "./NumberControlGroups";

export function SpawnerControlGroups({
  spawnerConfig,
  stats,
  savedGroup,
  setSavedGroup,
  updateSpawnerConfig,
  replaceSpawnerConfig,
  showSaveActions = true,
  saveSpawnerGroup = saveSpawnerConfigGroup,
}: {
  spawnerConfig: SpawnerConfig;
  stats?: MarketStatsPacket | null;
  savedGroup: string | null;
  setSavedGroup: (key: string | null) => void;
  updateSpawnerConfig: (key: keyof SpawnerConfig, value: number) => void;
  replaceSpawnerConfig: (config: SpawnerConfig) => void;
  showSaveActions?: boolean;
  saveSpawnerGroup?: (config: SpawnerConfig, keys: Array<keyof SpawnerConfig>) => SpawnerConfig;
}) {
  return (
    <div className="sine-parameters-stack">
      <ControlGroupSection title="NN Contract" collapsible sectionId="spawners:nn-contract">
        <div className="sine-readonly-grid">
          <Metric label="Recurrent type" value="GRU-like gates" />
          <Metric label="Inputs" value={String(INPUT_COUNT)} />
          <Metric label="Outputs" value={String(OUTPUT_COUNT)} />
        </div>
      </ControlGroupSection>
      <ControlGroupSection title="Reproduction Pressure" collapsible sectionId="spawners:reproduction-pressure">
        <div className="sine-readonly-grid">
          <Metric label="Population room" value={stats ? `${Math.round(stats.populationRoomRatio * 100)}%` : "--"} />
          <Metric label="Repro required" value={stats ? `${stats.currentReproductionEnergyRequirement.toFixed(1)} energy` : "--"} />
          <Metric label="Repro cost" value={stats ? `${stats.currentReproductionCost.toFixed(1)} energy` : "--"} />
          <Metric label="Repro cost x" value={stats ? `${stats.reproductionCostMultiplier.toFixed(2)}x` : "--"} />
        </div>
      </ControlGroupSection>
      <NumberControlGroups<keyof SpawnerConfig, SpawnerControlConfig>
        groups={SPAWNER_CONTROL_GROUPS}
        savedGroup={savedGroup}
        savedPrefix="spawners"
        collapsible
        defaultOpen={false}
        showSaveActions={showSaveActions}
        getValue={(key) => spawnerConfig[key]}
        getDisplay={(control) => String(roundForInput(spawnerConfig[control.key], control.step))}
        onSaveGroup={(group, savedKey) => {
            const saved = saveSpawnerGroup(
              spawnerConfig,
              group.controls.map((control) => control.key),
            );
            replaceSpawnerConfig(saved);
            setSavedGroup(savedKey);
        }}
        onChange={(_group, key, value, savedKey) => {
          updateSpawnerConfig(key, value);
          if (savedGroup === savedKey) setSavedGroup(null);
        }}
      />
    </div>
  );
}
