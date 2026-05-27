import { createGenomeIndex, type GenomeIndex } from "./genomeIndex";
import type { SpawnerGenome } from "./types";

export function architectureMetrics(genome: SpawnerGenome) {
  return architectureMetricsFromIndex(createGenomeIndex(genome));
}

export function architectureMetricsFromIndex(index: GenomeIndex) {
  return {
    activeUnits: index.units.length,
    activeLayers: index.layerIndexes.length,
    activeConnections: index.connections.length,
    disabledUnits: index.disabledUnits.length,
    disabledConnections: index.disabledConnections.length,
    recurrentConnections: index.connectionGroups.recurrent.length,
    skipConnections: index.connectionGroups.skip.length,
    outputConnections: index.connectionGroups.hiddenToOutput.length + index.connectionGroups.inputToOutput.length,
  };
}
