import type { SpawnerInspectionPayload } from "../marketWorkerProtocol";
import { fetchSineJson, sineApiUrl } from "../sineApi";
import type { SineSessionAnalysis, SineSessionSummary } from "./sineHistoryTypes";

export async function listSineSessions(limit = 50) {
  const payload = await fetchSineJson<{ sessions?: SineSessionSummary[] }>("/api/sine/sessions", {}, { limit });
  return payload.sessions ?? [];
}

export async function getSineSessionAnalysis(sessionId: string) {
  const payload = await fetchSineJson<{ analysis?: SineSessionAnalysis }>(`/api/sine/sessions/${encodeURIComponent(sessionId)}/analysis`);
  if (!payload.analysis) throw new Error("Missing analysis");
  return payload.analysis;
}

export async function deleteSineSession(sessionId: string) {
  const response = await fetch(sineApiUrl(`/api/sine/sessions/${encodeURIComponent(sessionId)}`), { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not delete saved run (${response.status})`);
}

export async function getSineSpawnerInspection(sessionId: string, spawnerId: number, tick: number | null) {
  const query = tick === null ? "" : `?tick=${tick}`;
  const payload = await fetchSineJson<{ payload?: SpawnerInspectionPayload }>(
    `/api/sine/sessions/${encodeURIComponent(sessionId)}/spawners/${spawnerId}${query}`,
  );
  if (!payload.payload) throw new Error("Missing payload");
  return payload.payload;
}
