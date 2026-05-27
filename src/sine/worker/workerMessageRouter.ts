import type {
  MarketChartPacket,
  MarketRosterPacket,
  MarketStatsPacket,
  MarketWorkerMessage,
  MarketWorkerSessionId,
  SpawnerArchitecturePacket,
  SpawnerInspectionPacket,
  SpawnerUniquenessDetailPacket,
} from "../marketWorkerProtocol";
import type { SinePersistencePacket } from "../protocol/persistenceProtocol";

export type MarketWorkerMessageHandlers = {
  chart: (packet: MarketChartPacket) => void;
  stats: (packet: MarketStatsPacket) => void;
  roster: (packet: MarketRosterPacket) => void;
  architecture: (packet: SpawnerArchitecturePacket) => void;
  spawnerInspection: (packet: SpawnerInspectionPacket) => void;
  uniquenessDetail: (packet: SpawnerUniquenessDetailPacket) => void;
  persistence: (persistencePacketId: number, packet: SinePersistencePacket) => void;
  error: (message: string) => void;
};

export function routeMarketWorkerMessage(
  message: MarketWorkerMessage,
  currentSessionId: MarketWorkerSessionId,
  handlers: MarketWorkerMessageHandlers,
) {
  if (!messageBelongsToSession(message, currentSessionId)) return false;

  switch (message.type) {
    case "chart":
      handlers.chart(message.packet);
      return true;
    case "stats":
      handlers.stats(message.packet);
      return true;
    case "roster":
      handlers.roster(message.packet);
      return true;
    case "architecture":
      handlers.architecture(message.packet);
      return true;
    case "spawnerInspection":
      handlers.spawnerInspection(message.packet);
      return true;
    case "uniquenessDetail":
      handlers.uniquenessDetail(message.packet);
      return true;
    case "persistence":
      handlers.persistence(message.persistencePacketId, message.packet);
      return true;
    case "error":
      handlers.error(message.message);
      return true;
    default:
      assertNever(message);
  }
}

function assertNever(message: never): never {
  throw new Error(`Unhandled worker message: ${JSON.stringify(message)}`);
}

function messageBelongsToSession(message: MarketWorkerMessage, currentSessionId: MarketWorkerSessionId) {
  if (message.type === "error") return message.sessionId === currentSessionId;
  return message.packet.sessionId === currentSessionId;
}
