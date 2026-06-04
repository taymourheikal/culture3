import { randomUUID } from "node:crypto";
import {
  deleteSineSession,
  getSineSessionCohortAnalysis,
  getSineSessionAnalysis,
  getSineSpawnerInspection,
  listSineSessions,
  saveSinePersistenceBatch,
  updateSineSessionStatus,
  upsertSineSession,
} from "./sineRepository.mjs";
import { readLimit } from "./validation.mjs";

export async function routeSineRequest({ req, res, url, readBody, sendJson, notFound }) {
  if (req.method === "GET" && url.pathname === "/api/sine/sessions") {
    sendJson(res, 200, { sessions: listSineSessions(readLimit(url.searchParams.get("limit"))) });
    return true;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sine\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && sessionMatch) {
    const result = deleteSineSession(readSessionId(sessionMatch));
    sendJson(res, result.ok ? 200 : 404, result.ok ? { ok: true } : { error: "Not found" });
    return true;
  }

  const statusMatch = url.pathname.match(/^\/api\/sine\/sessions\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const payload = JSON.parse(await readBody(req));
    const result = updateSineSessionStatus(readSessionId(statusMatch), String(payload.status ?? ""));
    if (!result.ok) {
      sendJson(res, result.error === "Not found" ? 404 : 400, { error: result.error });
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  const analysisMatch = url.pathname.match(/^\/api\/sine\/sessions\/([^/]+)\/analysis$/);
  if (req.method === "GET" && analysisMatch) {
    const analysis = getSineSessionAnalysis(readSessionId(analysisMatch), {
      fromPercent: url.searchParams.get("fromPercent"),
      toPercent: url.searchParams.get("toPercent"),
    });
    if (!analysis) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, analysis });
    return true;
  }

  const cohortMatch = url.pathname.match(/^\/api\/sine\/sessions\/([^/]+)\/cohort-analysis$/);
  if (req.method === "GET" && cohortMatch) {
    const analysis = getSineSessionCohortAnalysis(readSessionId(cohortMatch), {
      fromPercent: url.searchParams.get("fromPercent"),
      toPercent: url.searchParams.get("toPercent"),
      minTrades: url.searchParams.get("minTrades"),
      minAgePercentile: url.searchParams.get("minAgePercentile"),
      bucketCount: url.searchParams.get("bucketCount"),
    });
    if (!analysis) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, analysis });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sine/sessions") {
    const payload = JSON.parse(await readBody(req));
    const id = typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : randomUUID();
    const session = upsertSineSession({
      id,
      settings: payload.settings ?? {},
      spawnerConfig: payload.spawnerConfig ?? {},
      status: payload.status ?? "running",
    });
    sendJson(res, 200, { ok: true, sessionId: session.id });
    return true;
  }

  if (req.method === "POST" && (url.pathname === "/api/sine/events" || url.pathname === "/api/sine/snapshots")) {
    const payload = JSON.parse(await readBody(req));
    sendJson(res, 200, saveSinePersistenceBatch(payload));
    return true;
  }

  const spawnerMatch = url.pathname.match(/^\/api\/sine\/sessions\/([^/]+)\/spawners\/(\d+)$/);
  if (req.method === "GET" && spawnerMatch) {
    const tick = readOptionalTick(url.searchParams.get("tick"));
    if (tick === "invalid") {
      sendJson(res, 400, { error: "Invalid tick" });
      return true;
    }
    const payload = getSineSpawnerInspection(readSessionId(spawnerMatch), Number(spawnerMatch[2]), tick);
    if (!payload) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, payload });
    return true;
  }

  return false;
}

function readSessionId(match) {
  return decodeURIComponent(match[1]);
}

function readOptionalTick(value) {
  if (value === null || value === "") return undefined;
  const tick = Number(value);
  return Number.isFinite(tick) ? tick : "invalid";
}
