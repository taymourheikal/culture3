import { activeLayerIndexes, activeUnits } from "./genomeCommon";
import { activeConnections } from "./genomeConnections";
import type { SpawnerGenome } from "./types";

export function architectureMetrics(genome: SpawnerGenome) {
  const enabledConnections = activeConnections(genome);
  const recurrentConnections = enabledConnections.filter((connection) => connection.source.kind === "hidden" && connection.source.mode === "previous");
  const skipConnections = enabledConnections.filter((connection) => {
    if (connection.source.kind !== "hidden" || connection.source.mode !== "current" || connection.target.kind !== "hidden") return false;
    const sourceRef = connection.source;
    const targetRef = connection.target;
    const source = genome.units.find((unit) => unit.unitId === sourceRef.unitId);
    const target = genome.units.find((unit) => unit.unitId === targetRef.unitId);
    return !!source && !!target && target.layerIndex - source.layerIndex > 1;
  });
  return {
    activeUnits: activeUnits(genome).length,
    activeLayers: activeLayerIndexes(genome).length,
    activeConnections: enabledConnections.length,
    disabledUnits: genome.units.filter((unit) => !unit.enabled).length,
    disabledConnections: genome.connections.filter((connection) => !connection.enabled).length,
    recurrentConnections: recurrentConnections.length,
    skipConnections: skipConnections.length,
    outputConnections: enabledConnections.filter((connection) => connection.target.kind === "output").length,
  };
}
