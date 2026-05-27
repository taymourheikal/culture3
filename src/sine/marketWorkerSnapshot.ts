export { CHART_SAMPLE_INTERVAL_TICKS, CHART_TICKS_VISIBLE, createMarketChartPacket } from "./packets/chartPacket";
export { ROSTER_AGENT_LIMIT, createMarketRosterPacket, selectRosterSpawners } from "./packets/rosterPacket";
export { createMarketStatsPacket } from "./packets/statsPacket";
export {
  createSpawnerArchitecturePacket,
  createSpawnerInspectionPacket,
  createSpawnerInspectionPayload,
  createSpawnerUniquenessDetailPacket,
} from "./packets/inspectionPacket";
export { TELEMETRY_SAMPLE_LIMIT, createTelemetryWindow } from "./packets/telemetryWindow";
export {
  UNIQUENESS_TELEMETRY_SAMPLE_LIMIT,
  createEmptyUniquenessTelemetryWindow,
  createUniquenessTelemetryWindow,
} from "./packets/uniquenessTelemetryWindow";

export function estimatePacketKb(packet: unknown) {
  return Math.round((JSON.stringify(packet).length / 1024) * 10) / 10;
}
