import type { RosterSpawnerSummary } from "../marketWorkerProtocol";
import type { SelectedSpawnerPanelModel } from "../selectedSpawnerPanelModel";
import { LAB_METRIC_HELP } from "../sineMetricHelp";

export type LabMetricDescriptor = {
  label: string;
  value: string;
  help?: string;
};

export function selectedSpawnerStateMetrics(
  spawner: RosterSpawnerSummary,
  model: SelectedSpawnerPanelModel,
): LabMetricDescriptor[] {
  return [
    { label: "Age", value: `${model.ageTicks?.toLocaleString() ?? "--"} ticks` },
    { label: "Birth tick", value: spawner.birthTick.toLocaleString() },
    { label: "Open trades", value: String(spawner.pendingFoodCount) },
    { label: "Cooldown", value: `${spawner.cooldownTicks} ticks` },
  ];
}

export function selectedSpawnerBrainMetrics(spawner: RosterSpawnerSummary): LabMetricDescriptor[] {
  return [
    { label: "Active units", value: String(spawner.activeUnits) },
    { label: "Active layers", value: String(spawner.activeLayers) },
    { label: "Active links", value: String(spawner.activeConnections) },
    { label: "Recurrent links", value: String(spawner.recurrentConnections) },
    { label: "Skip links", value: String(spawner.skipConnections) },
    { label: "Disabled genes", value: `${spawner.disabledUnits}u / ${spawner.disabledConnections}l` },
  ];
}

export function selectedSpawnerLearningMetrics(spawner: RosterSpawnerSummary): LabMetricDescriptor[] {
  return [
    { label: "Learned delta norm", value: spawner.learnedDeltaNorm.toFixed(3), help: LAB_METRIC_HELP.learnedDeltaNorm },
    { label: "Recent learning", value: spawner.recentLearningSignal.toFixed(3), help: LAB_METRIC_HELP.recentLearning },
    { label: "Learning updates", value: String(spawner.learningUpdateCount), help: LAB_METRIC_HELP.learningUpdates },
    { label: "Repro learning", value: String(spawner.reproductionLearningCount), help: LAB_METRIC_HELP.reproductionLearning },
  ];
}
