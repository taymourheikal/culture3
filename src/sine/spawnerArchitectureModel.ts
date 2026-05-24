import { INPUT_COUNT, OUTPUT_COUNT, OUTPUT_LABELS, type ConnectionGene, type HiddenUnitGene, type SpawnerAgent } from "./spawnerSimulation";
import { connectionIsActive, createGenomeIndex } from "./spawner/genome";
import { INPUT_LABELS } from "./spawner/inputMetadata";

export type GraphNode = {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  kind: "input" | "unit" | "output";
  unit?: HiddenUnitGene;
};

export type GraphConnection = {
  connection: ConnectionGene;
  from: GraphNode;
  to: GraphNode;
};

export type ArchitectureGraphModel = {
  width: number;
  height: number;
  nodes: GraphNode[];
  connections: GraphConnection[];
};

export function buildGraph(spawner: SpawnerAgent, includeDisabled: boolean, minWeight: number): ArchitectureGraphModel {
  const genomeIndex = createGenomeIndex(spawner.genome);
  const units = spawner.genome.units
    .filter((unit) => includeDisabled || unit.enabled)
    .sort((left, right) => left.layerIndex - right.layerIndex || left.unitId - right.unitId);
  const layerIndexes = includeDisabled ? [...new Set(units.map((unit) => unit.layerIndex))].sort((left, right) => left - right) : genomeIndex.layerIndexes;
  const columnGap = 190;
  const rowGap = 66;
  const inputX = 80;
  const layerStartX = 250;
  const outputX = layerStartX + layerIndexes.length * columnGap + 160;
  const maxRows = Math.max(INPUT_COUNT, OUTPUT_COUNT, ...layerIndexes.map((layer) => units.filter((unit) => unit.layerIndex === layer).length), 1);
  const height = Math.max(620, maxRows * rowGap + 100);
  const centerY = height / 2;
  const nodes: GraphNode[] = [];

  for (let index = 0; index < INPUT_COUNT; index += 1) {
    nodes.push({
      id: inputNodeId(index),
      label: `I${index + 1}`,
      sublabel: INPUT_LABELS[index] ?? "input",
      x: inputX,
      y: centeredY(index, INPUT_COUNT, centerY, rowGap),
      kind: "input",
    });
  }

  layerIndexes.forEach((layerIndex, layerPosition) => {
    const layerUnits = units.filter((unit) => unit.layerIndex === layerIndex);
    layerUnits.forEach((unit, index) => {
      nodes.push({
        id: unitNodeId(unit.unitId),
        label: `U${unit.unitId}`,
        sublabel: `layer ${unit.layerIndex}`,
        x: layerStartX + layerPosition * columnGap,
        y: centeredY(index, layerUnits.length, centerY, rowGap),
        kind: "unit",
        unit,
      });
    });
  });

  for (let index = 0; index < OUTPUT_COUNT; index += 1) {
    nodes.push({
      id: outputNodeId(index),
      label: `O${index + 1}`,
      sublabel: OUTPUT_LABELS[index] ?? "output",
      x: outputX,
      y: centeredY(index, OUTPUT_COUNT, centerY, rowGap),
      kind: "output",
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connections = filteredConnections(spawner.genome.connections, includeDisabled, minWeight)
    .filter((connection) => includeDisabled || connectionIsActive(connection, genomeIndex.activeUnitIds))
    .map((connection) => {
      const from = nodeById.get(sourceNodeId(connection.source));
      const to = nodeById.get(targetNodeId(connection.target));
      return from && to ? { connection, from, to } : null;
    })
    .filter((edge): edge is GraphConnection => edge !== null);

  return { width: outputX + 90, height, nodes, connections };
}

export function filteredConnections(connections: ConnectionGene[], includeDisabled: boolean, minWeight: number) {
  return connections.filter((connection) => (includeDisabled || connection.enabled) && Math.abs(connection.weight) >= minWeight);
}

export function connectionSummary(connection: ConnectionGene) {
  return `${sourceLabel(connection.source)} -> ${targetLabel(connection.target)} | weight ${connection.weight.toFixed(5)} | innovation ${connection.innovationId} | ${connection.enabled ? "enabled" : "disabled"}`;
}

export function sourceLabel(source: ConnectionGene["source"]) {
  if (source.kind === "input") return `I${source.index + 1}: ${INPUT_LABELS[source.index] ?? "input"}`;
  return `U${source.unitId} ${source.mode}`;
}

export function targetLabel(target: ConnectionGene["target"]) {
  if (target.kind === "output") return `O${target.index + 1}: ${OUTPUT_LABELS[target.index] ?? "output"}`;
  return `U${target.unitId} ${target.gate}`;
}

export function isPreviousConnection(connection: ConnectionGene) {
  return connection.source.kind === "hidden" && connection.source.mode === "previous";
}

function centeredY(index: number, count: number, centerY: number, rowGap: number) {
  return centerY + (index - (count - 1) / 2) * rowGap;
}

function sourceNodeId(source: ConnectionGene["source"]) {
  if (source.kind === "input") return inputNodeId(source.index);
  return unitNodeId(source.unitId);
}

function targetNodeId(target: ConnectionGene["target"]) {
  if (target.kind === "output") return outputNodeId(target.index);
  return unitNodeId(target.unitId);
}

function inputNodeId(index: number) {
  return `input:${index}`;
}

function unitNodeId(unitId: number) {
  return `unit:${unitId}`;
}

function outputNodeId(index: number) {
  return `output:${index}`;
}
