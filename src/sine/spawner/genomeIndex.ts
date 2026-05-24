import { activeUnits } from "./genomeCommon";
import { activeConnections } from "./genomeConnections";
import type { ConnectionGene, HiddenUnitGene, SpawnerGenome } from "./types";

export type GenomeConnectionGroups = {
  inputToHidden: ConnectionGene[];
  recurrent: ConnectionGene[];
  hiddenCurrentToHidden: ConnectionGene[];
  hiddenToOutput: ConnectionGene[];
  inputToOutput: ConnectionGene[];
  skip: ConnectionGene[];
};

export type GenomeIndex = ReturnType<typeof createGenomeIndex>;

export function createGenomeIndex(genome: SpawnerGenome) {
  const units = activeUnits(genome);
  const disabledUnits = genome.units.filter((unit) => !unit.enabled);
  const activeUnitIds = new Set(units.map((unit) => unit.unitId));
  const unitById = new Map(genome.units.map((unit) => [unit.unitId, unit]));
  const activeUnitById = new Map(units.map((unit) => [unit.unitId, unit]));
  const connections = activeConnections(genome);
  const disabledConnections = genome.connections.filter((connection) => !connection.enabled || !connectionIsActive(connection, activeUnitIds));
  const layerIndexes = [...new Set(units.map((unit) => unit.layerIndex))].sort((left, right) => left - right);
  const layerCounts = layerIndexes.map((layer) => units.filter((unit) => unit.layerIndex === layer).length);
  const unitsByLayer = new Map<number, HiddenUnitGene[]>();
  for (const layer of layerIndexes) {
    unitsByLayer.set(layer, units.filter((unit) => unit.layerIndex === layer));
  }
  const connectionGroups = groupConnections(genome, connections, unitById);

  return {
    genome,
    units,
    disabledUnits,
    activeUnitIds,
    unitById,
    activeUnitById,
    connections,
    disabledConnections,
    layerIndexes,
    layerCounts,
    unitsByLayer,
    connectionGroups,
    incomingToUnit: (unitId: number) => connections.filter((connection) => connection.target.kind === "hidden" && connection.target.unitId === unitId),
    outgoingFromUnit: (unitId: number) => connections.filter((connection) => connection.source.kind === "hidden" && connection.source.unitId === unitId),
  };
}

export function connectionIsActive(connection: ConnectionGene, activeUnitIds: Set<number>) {
  if (!connection.enabled) return false;
  if (connection.source.kind === "hidden" && !activeUnitIds.has(connection.source.unitId)) return false;
  if (connection.target.kind === "hidden" && !activeUnitIds.has(connection.target.unitId)) return false;
  return true;
}

export function groupConnections(genome: SpawnerGenome, connections: ConnectionGene[], unitById: Map<number, HiddenUnitGene>) {
  const inputToHidden = connections.filter((connection) => connection.source.kind === "input" && connection.target.kind === "hidden");
  const recurrent = connections.filter((connection) => connection.source.kind === "hidden" && connection.source.mode === "previous" && connection.target.kind === "hidden");
  const hiddenCurrentToHidden = connections.filter(
    (connection) => connection.source.kind === "hidden" && connection.source.mode === "current" && connection.target.kind === "hidden",
  );
  const hiddenToOutput = connections.filter((connection) => connection.source.kind === "hidden" && connection.target.kind === "output");
  const inputToOutput = connections.filter((connection) => connection.source.kind === "input" && connection.target.kind === "output");
  const skip = hiddenCurrentToHidden.filter((connection) => {
    if (connection.source.kind !== "hidden" || connection.target.kind !== "hidden") return false;
    const sourceRef = connection.source;
    const targetRef = connection.target;
    const source = unitById.get(sourceRef.unitId) ?? genome.units.find((unit) => unit.unitId === sourceRef.unitId);
    const target = unitById.get(targetRef.unitId) ?? genome.units.find((unit) => unit.unitId === targetRef.unitId);
    return !!source && !!target && target.layerIndex - source.layerIndex > 1;
  });
  return { inputToHidden, recurrent, hiddenCurrentToHidden, hiddenToOutput, inputToOutput, skip };
}
