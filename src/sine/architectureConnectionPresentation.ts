import { getEffectiveConnectionDetail, type ConnectionGene, type SpawnerAgent } from "./spawnerSimulation";
import { connectionSummary, isPreviousConnection, sourceLabel, targetLabel } from "./spawnerArchitectureModel";

export function connectionRowClass(connection: ConnectionGene, selected: boolean) {
  return `connection-row${selected ? " selected" : ""}${connection.enabled ? "" : " disabled"}`;
}

export function connectionRowParts(connection: ConnectionGene) {
  return {
    source: sourceLabel(connection.source),
    weight: connection.weight.toFixed(3),
    target: targetLabel(connection.target),
  };
}

export function connectionDetailRows(connection: ConnectionGene, spawner: SpawnerAgent | null) {
  const detail = spawner ? getEffectiveConnectionDetail(connection, spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta) : null;
  return [
    { label: "Innovation", value: String(connection.innovationId) },
    { label: "Source", value: sourceLabel(connection.source) },
    { label: "Target", value: targetLabel(connection.target) },
    { label: "Base weight", value: detail?.base.toFixed(5) ?? connection.weight.toFixed(5) },
    { label: "Learned delta", value: detail?.learnedDelta.toFixed(5) ?? "0.00000" },
    { label: "Effective weight", value: detail?.effective.toFixed(5) ?? connection.weight.toFixed(5) },
    { label: "State", value: connection.enabled ? "enabled" : "disabled" },
  ];
}

export function graphConnectionStyle(connection: ConnectionGene) {
  const positive = connection.weight >= 0;
  return {
    color: connection.enabled ? (positive ? "var(--sine-accent)" : "var(--sine-negative)") : "var(--sine-text-faint)",
    marker: connection.enabled ? (positive ? "url(#architecture-arrow-positive)" : "url(#architecture-arrow-negative)") : "url(#architecture-arrow-disabled)",
    width: Math.min(6, 1 + Math.abs(connection.weight) * 1.15),
    opacity: connection.enabled ? 0.6 : 0.28,
    dash: connection.enabled ? (isPreviousConnection(connection) ? "5 4" : undefined) : "3 5",
    label: connection.weight.toFixed(2),
    summary: connectionSummary(connection),
  };
}
