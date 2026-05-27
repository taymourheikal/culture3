import type { SpawnerInspectionPacket } from "../marketWorkerProtocol";

type PendingInspectionRequest = {
  resolve: (packet: SpawnerInspectionPacket) => void;
  timeout: ReturnType<typeof setTimeout>;
  updateState: boolean;
};

export function createInspectionRequestStore() {
  const pending = new Map<number, PendingInspectionRequest>();

  return {
    set(requestId: number, request: PendingInspectionRequest) {
      pending.set(requestId, request);
    },
    resolve(packet: SpawnerInspectionPacket) {
      const request = pending.get(packet.requestId);
      if (!request) return null;
      clearTimeout(request.timeout);
      request.resolve(packet);
      pending.delete(packet.requestId);
      return request;
    },
    rejectAll(sessionId: number, error: SpawnerInspectionPacket["error"] = "not_found") {
      for (const [requestId, request] of pending) {
        clearTimeout(request.timeout);
        request.resolve({
          sessionId,
          requestId,
          spawnerId: -1,
          ok: false,
          payload: null,
          error,
        });
      }
      pending.clear();
    },
    delete(requestId: number) {
      pending.delete(requestId);
    },
  };
}
