export type * from "./protocol/chartProtocol";
export type * from "./protocol/inspectionProtocol";
export type * from "./protocol/persistenceProtocol";
export type * from "./protocol/rosterProtocol";
export type * from "./protocol/statsProtocol";
export type * from "./protocol/workerCommandProtocol";
export { MARKET_WORKER_COMMAND_TYPES } from "./protocol/workerCommandProtocol";

import type { MarketChartPacket } from "./protocol/chartProtocol";
import type { SpawnerArchitecturePacket, SpawnerInspectionPacket, SpawnerUniquenessDetailPacket } from "./protocol/inspectionProtocol";
import type { SinePersistencePacket } from "./protocol/persistenceProtocol";
import type { MarketRosterPacket } from "./protocol/rosterProtocol";
import type { MarketStatsPacket } from "./protocol/statsProtocol";
import type { MarketWorkerSessionId } from "./protocol/workerCommandProtocol";

export type MarketWorkerMessage =
  | { type: "chart"; packet: MarketChartPacket }
  | { type: "roster"; packet: MarketRosterPacket }
  | { type: "stats"; packet: MarketStatsPacket }
  | { type: "architecture"; packet: SpawnerArchitecturePacket }
  | { type: "spawnerInspection"; packet: SpawnerInspectionPacket }
  | { type: "uniquenessDetail"; packet: SpawnerUniquenessDetailPacket }
  | { type: "persistence"; persistencePacketId: number; packet: SinePersistencePacket }
  | { type: "error"; sessionId: MarketWorkerSessionId; message: string };
