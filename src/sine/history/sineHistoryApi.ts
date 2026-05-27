import type { SpawnerInspectionPayload } from "../marketWorkerProtocol";
import { deleteSineJson, getSineJson } from "../sineApi";
import type { SineSessionAnalysis, SineSessionSummary } from "./sineHistoryTypes";

export async function listSineSessions(limit = 50) {
  const payload = await getSineJson<{ sessions?: SineSessionSummary[] }>("/api/sine/sessions", { limit });
  return payload.sessions ?? [];
}

export async function getSineSessionAnalysis(sessionId: string) {
  const payload = await getSineJson<{ analysis?: SineSessionAnalysis }>(`/api/sine/sessions/${encodeURIComponent(sessionId)}/analysis`);
  if (!payload.analysis) throw new Error("Missing analysis");
  return payload.analysis;
}

export async function deleteSineSession(sessionId: string) {
  await deleteSineJson(`/api/sine/sessions/${encodeURIComponent(sessionId)}`, { errorMessage: (status) => `Could not delete saved run (${status})` });
}

export async function getSineSpawnerInspection(sessionId: string, spawnerId: number, tick: number | null) {
  const payload = await getSineJson<{ payload?: SpawnerInspectionPayload }>(
    `/api/sine/sessions/${encodeURIComponent(sessionId)}/spawners/${spawnerId}`,
    tick === null ? undefined : { tick },
  );
  if (!payload.payload) throw new Error("Missing payload");
  return payload.payload;
}
