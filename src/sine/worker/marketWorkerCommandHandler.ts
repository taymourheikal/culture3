import type { MarketWorkerCommand, MarketWorkerSessionId } from "../marketWorkerProtocol";

type CommandOf<T extends MarketWorkerCommand["type"]> = Extract<MarketWorkerCommand, { type: T }>;

export type MarketWorkerCommandHandlers = {
  reset: (command: CommandOf<"reset">) => void;
  start: (command: CommandOf<"start">) => void;
  pause: (command: CommandOf<"pause">) => void;
  stop: (command: CommandOf<"stop">) => void;
  setSettings: (command: CommandOf<"setSettings">) => void;
  setMarketConfig: (command: CommandOf<"setMarketConfig">) => void;
  setPlaybackSettings: (command: CommandOf<"setPlaybackSettings">) => void;
  setMarketSource: (command: CommandOf<"setMarketSource">) => void;
  setSpawnerConfig: (command: CommandOf<"setSpawnerConfig">) => void;
  replaceSpawnerConfig: (command: CommandOf<"replaceSpawnerConfig">) => void;
  requestPackets: (command: CommandOf<"requestPackets">) => void;
  requestSpawnerArchitecture: (command: CommandOf<"requestSpawnerArchitecture">) => void;
  requestSpawnerInspection: (command: CommandOf<"requestSpawnerInspection">) => void;
  requestUniquenessDetail: (command: CommandOf<"requestUniquenessDetail">) => void;
  setSelectedSpawnerForCharts: (command: CommandOf<"setSelectedSpawnerForCharts">) => void;
  persistenceAck: (command: CommandOf<"persistenceAck">) => void;
};

export function dispatchMarketWorkerCommand(
  command: MarketWorkerCommand,
  currentSessionId: MarketWorkerSessionId,
  handlers: MarketWorkerCommandHandlers,
) {
  if (command.type === "reset") {
    handlers.reset(command);
    return;
  }
  if (command.sessionId !== currentSessionId) return;

  switch (command.type) {
    case "start":
      handlers.start(command);
      break;
    case "pause":
      handlers.pause(command);
      break;
    case "stop":
      handlers.stop(command);
      break;
    case "setSettings":
      handlers.setSettings(command);
      break;
    case "setMarketConfig":
      handlers.setMarketConfig(command);
      break;
    case "setPlaybackSettings":
      handlers.setPlaybackSettings(command);
      break;
    case "setMarketSource":
      handlers.setMarketSource(command);
      break;
    case "setSpawnerConfig":
      handlers.setSpawnerConfig(command);
      break;
    case "replaceSpawnerConfig":
      handlers.replaceSpawnerConfig(command);
      break;
    case "requestPackets":
      handlers.requestPackets(command);
      break;
    case "requestSpawnerArchitecture":
      handlers.requestSpawnerArchitecture(command);
      break;
    case "requestSpawnerInspection":
      handlers.requestSpawnerInspection(command);
      break;
    case "requestUniquenessDetail":
      handlers.requestUniquenessDetail(command);
      break;
    case "setSelectedSpawnerForCharts":
      handlers.setSelectedSpawnerForCharts(command);
      break;
    case "persistenceAck":
      handlers.persistenceAck(command);
      break;
    default:
      assertNever(command);
  }
}

function assertNever(command: never): never {
  throw new Error(`Unhandled worker command: ${JSON.stringify(command)}`);
}
