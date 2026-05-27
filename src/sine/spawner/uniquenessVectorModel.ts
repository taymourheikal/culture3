import { INPUT_COUNT, OUTPUT_LABELS } from "./config";
import { activeLayerIndexes } from "./genome";
import { groupConnections } from "./genomeIndex";
import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerGenome } from "./types";
import { absMean as sharedAbsMean, finiteZero, mean as sharedMean, populationStdDev } from "../stats";

export const UNIQUENESS_GATES: GateType[] = ["update", "reset", "candidate"];
export const UNIQUENESS_OUTPUT_LABELS = OUTPUT_LABELS;

export type ConnectionGroups = ReturnType<typeof groupConnections>;

export function buildFeatureContext(genome: SpawnerGenome, units: HiddenUnitGene[], connections: ConnectionGene[], unitById: Map<number, HiddenUnitGene>) {
  const layerIndexes = activeLayerIndexes(genome);
  const layerCounts = layerIndexes.map((layer) => units.filter((unit) => unit.layerIndex === layer).length);
  const connectionGroups = groupConnections(genome, connections, unitById);
  const recurrence = recurrenceMetrics(units, connectionGroups.recurrent);
  const reachability = reachabilityMetrics(units, connectionGroups);
  return { layerIndexes, layerCounts, connectionGroups, recurrence, reachability };
}

export function normalizedEntropy(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0 || counts.length <= 1) return 0;
  const entropy = counts.reduce((sum, count) => {
    if (count <= 0) return sum;
    const p = count / total;
    return sum - p * Math.log(p);
  }, 0);
  return entropy / Math.log(counts.length);
}

export function feature(key: string, label: string, value: number) {
  return { key, label, value };
}

export function weight(connection: ConnectionGene) {
  return connection.weight;
}

export function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function mean(values: number[]) {
  return sharedMean(values);
}

export function absMean(values: number[]) {
  return sharedAbsMean(values);
}

export function std(values: number[]) {
  return populationStdDev(values);
}

export function positiveRatio(values: number[]) {
  return values.length > 0 ? values.filter((value) => value > 0).length / values.length : 0;
}

export function finite(value: number) {
  return finiteZero(value);
}

export function possibleRecurrentConnections(units: HiddenUnitGene[]) {
  const layers = [...new Set(units.map((unit) => unit.layerIndex))];
  return layers.reduce((sum, layer) => {
    const width = units.filter((unit) => unit.layerIndex === layer).length;
    return sum + width * width * UNIQUENESS_GATES.length;
  }, 0);
}

export function possibleSkipConnections(units: HiddenUnitGene[]) {
  let possible = 0;
  for (const source of units) {
    for (const target of units) {
      if (target.layerIndex - source.layerIndex > 1) possible += UNIQUENESS_GATES.length;
    }
  }
  return possible;
}

function recurrenceMetrics(units: HiddenUnitGene[], recurrent: ConnectionGene[]) {
  const byTarget = new Map<number, ConnectionGene[]>();
  for (const connection of recurrent) {
    if (connection.target.kind !== "hidden") continue;
    byTarget.set(connection.target.unitId, [...(byTarget.get(connection.target.unitId) ?? []), connection]);
  }
  const recurrentInputCounts = units.map((unit) => byTarget.get(unit.unitId)?.length ?? 0);
  const selfRecurrentUnits = new Set(
    recurrent
      .filter((connection) => connection.source.kind === "hidden" && connection.target.kind === "hidden" && connection.source.unitId === connection.target.unitId)
      .map((connection) => (connection.target.kind === "hidden" ? connection.target.unitId : -1)),
  );
  return {
    unitsWithRecurrentInputRatio: ratio(recurrentInputCounts.filter((count) => count > 0).length, units.length),
    unitsWithSelfRecurrenceRatio: ratio(selfRecurrentUnits.size, units.length),
    meanRecurrentInputsPerUnit: mean(recurrentInputCounts),
    maxRecurrentInputsPerUnit: Math.max(0, ...recurrentInputCounts),
  };
}

function reachabilityMetrics(units: HiddenUnitGene[], groups: ReturnType<typeof groupConnections>) {
  const unitIds = new Set(units.map((unit) => unit.unitId));
  const inputReachable = new Set<number>();
  const forwardEdges = new Map<number, number[]>();
  const reverseEdges = new Map<number, number[]>();

  for (const connection of [...groups.inputToHidden, ...groups.hiddenCurrentToHidden]) {
    if (connection.target.kind !== "hidden") continue;
    if (connection.source.kind === "input") {
      inputReachable.add(connection.target.unitId);
      continue;
    }
    if (!unitIds.has(connection.source.unitId)) continue;
    forwardEdges.set(connection.source.unitId, [...(forwardEdges.get(connection.source.unitId) ?? []), connection.target.unitId]);
    reverseEdges.set(connection.target.unitId, [...(reverseEdges.get(connection.target.unitId) ?? []), connection.source.unitId]);
  }

  expandReachable(inputReachable, forwardEdges);

  const outputReachable = new Set<number>();
  for (const connection of groups.hiddenToOutput) {
    if (connection.source.kind === "hidden") outputReachable.add(connection.source.unitId);
  }
  expandReachable(outputReachable, reverseEdges);

  const liveUnits = units.filter((unit) => inputReachable.has(unit.unitId) && outputReachable.has(unit.unitId));
  const pathLengths = shortestInputToOutputPathLengths(groups);
  return {
    inputReachableUnitRatio: ratio(inputReachable.size, units.length),
    outputReachableUnitRatio: ratio(outputReachable.size, units.length),
    deadUnitRatio: ratio(units.length - liveUnits.length, units.length),
    averageInputToOutputPathLength: mean(pathLengths),
    maxInputToOutputPathLength: Math.max(0, ...pathLengths),
  };
}

function shortestInputToOutputPathLengths(groups: ReturnType<typeof groupConnections>) {
  const outputNode = "output";
  const adjacency = new Map<string, string[]>();
  for (const connection of groups.inputToOutput) {
    if (connection.source.kind === "input" && connection.target.kind === "output") addEdge(adjacency, `input:${connection.source.index}`, outputNode);
  }
  for (const connection of groups.inputToHidden) {
    if (connection.source.kind === "input" && connection.target.kind === "hidden") addEdge(adjacency, `input:${connection.source.index}`, `unit:${connection.target.unitId}`);
  }
  for (const connection of groups.hiddenCurrentToHidden) {
    if (connection.source.kind === "hidden" && connection.target.kind === "hidden") addEdge(adjacency, `unit:${connection.source.unitId}`, `unit:${connection.target.unitId}`);
  }
  for (const connection of groups.hiddenToOutput) {
    if (connection.source.kind === "hidden" && connection.target.kind === "output") addEdge(adjacency, `unit:${connection.source.unitId}`, outputNode);
  }

  const lengths: number[] = [];
  for (let input = 0; input < INPUT_COUNT; input += 1) {
    const length = shortestPath(adjacency, `input:${input}`, outputNode);
    if (length !== null) lengths.push(length);
  }
  return lengths;
}

function expandReachable(reachable: Set<number>, edges: Map<number, number[]>) {
  const queue = [...reachable];
  while (queue.length > 0) {
    const unitId = queue.shift();
    if (unitId === undefined) continue;
    for (const next of edges.get(unitId) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
}

function addEdge(edges: Map<string, string[]>, from: string, to: string) {
  edges.set(from, [...(edges.get(from) ?? []), to]);
}

function shortestPath(edges: Map<string, string[]>, start: string, end: string) {
  const queue: Array<{ node: string; length: number }> = [{ node: start, length: 0 }];
  const seen = new Set<string>([start]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.node === end) return current.length;
    for (const next of edges.get(current.node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ node: next, length: current.length + 1 });
    }
  }
  return null;
}
