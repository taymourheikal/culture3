import { OUTPUT_COUNT } from "./config";
import { activeConnections, activeLayerIndexes, activeUnits } from "./genome";
import { sigmoid } from "./math";
import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerAgent } from "./types";

export function forwardSpawner(spawner: SpawnerAgent, inputs: number[]) {
  alignHiddenState(spawner);
  const genome = spawner.genome;
  const previousState = { ...spawner.hiddenState };
  const currentState: Record<number, number> = {};
  const enabledUnits = activeUnits(genome);
  const unitById = new Map(enabledUnits.map((unit) => [unit.unitId, unit]));
  const connections = activeConnections(genome);

  for (const layerIndex of activeLayerIndexes(genome)) {
    const layerUnits = enabledUnits.filter((unit) => unit.layerIndex === layerIndex);
    for (const unit of layerUnits) {
      const update = sigmoid(gateSum(unit, "update", connections, inputs, previousState, currentState, unitById));
      const reset = sigmoid(gateSum(unit, "reset", connections, inputs, previousState, currentState, unitById));
      const candidate = Math.tanh(gateSum(unit, "candidate", connections, inputs, previousState, currentState, unitById, reset));
      currentState[unit.unitId] = (1 - update) * (previousState[unit.unitId] ?? 0) + update * candidate;
    }
  }

  spawner.hiddenState = { ...previousState, ...currentState };
  alignHiddenState(spawner);
  return Array.from({ length: OUTPUT_COUNT }, (_, outputIndex) => {
    const sum = connections
      .filter((connection) => connection.target.kind === "output" && connection.target.index === outputIndex)
      .reduce((total, connection) => total + connection.weight * sourceValue(connection, inputs, previousState, currentState), 0);
    return sum + (genome.outputBias[outputIndex] ?? 0);
  });
}

export function alignHiddenState(spawner: SpawnerAgent) {
  const nextState = { ...spawner.hiddenState };
  for (const unit of spawner.genome.units) {
    if (!Number.isFinite(nextState[unit.unitId])) nextState[unit.unitId] = 0;
  }
  spawner.hiddenState = nextState;
}

function gateSum(
  unit: HiddenUnitGene,
  gate: GateType,
  connections: ConnectionGene[],
  inputs: number[],
  previousState: Record<number, number>,
  currentState: Record<number, number>,
  unitById: Map<number, HiddenUnitGene>,
  reset = 1,
) {
  const bias = gate === "update" ? unit.updateBias : gate === "reset" ? unit.resetBias : unit.candidateBias;
  return connections
    .filter((connection) => connection.target.kind === "hidden" && connection.target.unitId === unit.unitId && connection.target.gate === gate)
    .reduce((total, connection) => {
      const value = sourceValue(connection, inputs, previousState, currentState, unitById);
      const gatedValue = gate === "candidate" && connection.source.kind === "hidden" && connection.source.mode === "previous" ? value * reset : value;
      return total + connection.weight * gatedValue;
    }, bias);
}

function sourceValue(
  connection: ConnectionGene,
  inputs: number[],
  previousState: Record<number, number>,
  currentState: Record<number, number>,
  unitById?: Map<number, HiddenUnitGene>,
) {
  const source = connection.source;
  if (source.kind === "input") return inputs[source.index] ?? 0;
  if (source.mode === "previous") return previousState[source.unitId] ?? 0;
  if (unitById && !unitById.has(source.unitId)) return 0;
  return currentState[source.unitId] ?? 0;
}
