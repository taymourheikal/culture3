import { useEffect } from "react";
import type { SpawnerInspectionPacket } from "../marketWorkerProtocol";

type InspectResult =
  | { ok: true; payload: NonNullable<SpawnerInspectionPacket["payload"]> }
  | { ok: false; error: string };

export function useLiveSpawnerInspector(
  requestSpawnerInspection: (
    spawnerId: number,
    options?: { updateState?: boolean },
  ) => Promise<SpawnerInspectionPacket>,
) {
  useEffect(() => {
    const target = window as typeof window & {
      inspectFoodSpawner?: (spawnerId: number) => Promise<InspectResult>;
    };
    target.inspectFoodSpawner = async (spawnerId: number) => {
      const parsed = Math.floor(Number(spawnerId));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { ok: false, error: "invalid_spawner_id" };
      }
      const packet = await requestSpawnerInspection(parsed, { updateState: false });
      return packet.ok && packet.payload ? { ok: true, payload: packet.payload } : { ok: false, error: packet.error ?? "not_found" };
    };
    return () => {
      if (target.inspectFoodSpawner) delete target.inspectFoodSpawner;
    };
  }, [requestSpawnerInspection]);
}
