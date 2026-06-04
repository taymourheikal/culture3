import { OUTPUT_COUNT } from "./config";
import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerGenome } from "./types";

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
  const units: HiddenUnitGene[] = [];
  const disabledUnits: HiddenUnitGene[] = [];
  const activeUnitIds = new Set<number>();
  const unitById = new Map<number, HiddenUnitGene>();
  const activeUnitById = new Map<number, HiddenUnitGene>();
  for (const unit of genome.units) {
    unitById.set(unit.unitId, unit);
    if (unit.enabled) {
      units.push(unit);
      activeUnitIds.add(unit.unitId);
      activeUnitById.set(unit.unitId, unit);
    } else {
      disabledUnits.push(unit);
    }
  }
  const connections: ConnectionGene[] = [];
  const disabledConnections: ConnectionGene[] = [];
  for (const connection of genome.connections) {
    if (connection.enabled && connectionIsActive(connection, activeUnitIds)) {
      connections.push(connection);
    } else {
      disabledConnections.push(connection);
    }
  }
  const layerIndexes: number[] = [];
  const unitsByLayer = new Map<number, HiddenUnitGene[]>();
  for (const unit of units) {
    if (!unitsByLayer.has(unit.layerIndex)) {
      unitsByLayer.set(unit.layerIndex, []);
      layerIndexes.push(unit.layerIndex);
    }
    unitsByLayer.get(unit.layerIndex)?.push(unit);
  }
  layerIndexes.sort((left, right) => left - right);
  const layerCounts = layerIndexes.map((layer) => unitsByLayer.get(layer)?.length ?? 0);
  const connectionGroups = groupConnections(connections, unitById);
  const incomingByUnit = new Map<number, ConnectionGene[]>();
  const outgoingByUnit = new Map<number, ConnectionGene[]>();
  const hiddenGateInputs = new Map<string, ConnectionGene[]>();
  const outputInputs = Array.from({ length: OUTPUT_COUNT }, () => [] as ConnectionGene[]);

  for (const connection of connections) {
    if (connection.source.kind === "hidden") {
      pushMap(outgoingByUnit, connection.source.unitId, connection);
    }
    if (connection.target.kind === "hidden") {
      pushMap(incomingByUnit, connection.target.unitId, connection);
      pushMap(hiddenGateInputs, hiddenGateInputKey(connection.target.unitId, connection.target.gate), connection);
    } else {
      outputInputs[connection.target.index]?.push(connection);
    }
  }

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
    incomingByUnit,
    outgoingByUnit,
    hiddenGateInputs,
    outputInputs,
    incomingToUnit: (unitId: number) => incomingByUnit.get(unitId) ?? [],
    outgoingFromUnit: (unitId: number) => outgoingByUnit.get(unitId) ?? [],
  };
}

export function hiddenGateInputKey(unitId: number, gate: GateType) {
  return `${unitId}:${gate}`;
}

export function connectionIsActive(connection: ConnectionGene, activeUnitIds: Set<number>) {
  if (!connection.enabled) return false;
  if (connection.source.kind === "hidden" && !activeUnitIds.has(connection.source.unitId)) return false;
  if (connection.target.kind === "hidden" && !activeUnitIds.has(connection.target.unitId)) return false;
  return true;
}

export function groupConnections(connections: ConnectionGene[], unitById: Map<number, HiddenUnitGene>) {
  const inputToHidden: ConnectionGene[] = [];
  const recurrent: ConnectionGene[] = [];
  const hiddenCurrentToHidden: ConnectionGene[] = [];
  const hiddenToOutput: ConnectionGene[] = [];
  const inputToOutput: ConnectionGene[] = [];
  const skip: ConnectionGene[] = [];
  for (const connection of connections) {
    const { source, target } = connection;
    if (target.kind === "hidden") {
      if (source.kind === "input") {
        inputToHidden.push(connection);
        continue;
      }
      if (source.mode === "previous") {
        recurrent.push(connection);
        continue;
      }
      hiddenCurrentToHidden.push(connection);
      const sourceUnit = unitById.get(source.unitId);
      const targetUnit = unitById.get(target.unitId);
      if (sourceUnit && targetUnit && targetUnit.layerIndex - sourceUnit.layerIndex > 1) skip.push(connection);
      continue;
    }
    if (source.kind === "hidden") hiddenToOutput.push(connection);
    else inputToOutput.push(connection);
  }
  return { inputToHidden, recurrent, hiddenCurrentToHidden, hiddenToOutput, inputToOutput, skip };
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}
