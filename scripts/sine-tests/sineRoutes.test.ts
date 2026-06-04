import { Readable } from "node:stream";
import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error Server routes are runtime ESM loaded by tsx for integration coverage.
import { routeRequest } from "../../server/routes.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession } from "../../server/sineRepository.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";

async function testSineRoutesPreserveSessionLifecycleResponses() {
  const sessionId = uniqueTestSessionId("route-test");
  try {
    const created = await request("POST", "/api/sine/sessions", {
      id: sessionId,
      settings: INITIAL_SETTINGS,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      status: "running",
    });
    assert.equal(created.status, 200);
    assert.deepEqual(created.payload, { ok: true, sessionId });

    const listed = await request("GET", "/api/sine/sessions?limit=200");
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.payload.sessions), true);
    assert.equal(listed.payload.sessions.some((session: { id: string }) => session.id === sessionId), true);

    const invalidStatus = await request("PATCH", `/api/sine/sessions/${encodeURIComponent(sessionId)}/status`, { status: "bogus" });
    assert.equal(invalidStatus.status, 400);
    assert.deepEqual(invalidStatus.payload, { error: "Invalid status" });

    const paused = await request("PATCH", `/api/sine/sessions/${encodeURIComponent(sessionId)}/status`, { status: "paused" });
    assert.equal(paused.status, 200);
    assert.equal(paused.payload.ok, true);
    assert.equal(paused.payload.status, "paused");

    const deleted = await request("DELETE", `/api/sine/sessions/${encodeURIComponent(sessionId)}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.payload, { ok: true });

    const missingDelete = await request("DELETE", `/api/sine/sessions/${encodeURIComponent(sessionId)}`);
    assert.equal(missingDelete.status, 404);
    assert.deepEqual(missingDelete.payload, { error: "Not found" });
  } finally {
    deleteSineSession(sessionId);
  }
}

async function testSineRoutesPreserveInspectionAndSnapshotErrors() {
  const invalidTick = await request("GET", "/api/sine/sessions/missing/spawners/1?tick=abc");
  assert.equal(invalidTick.status, 400);
  assert.deepEqual(invalidTick.payload, { error: "Invalid tick" });

  const missingInspection = await request("GET", "/api/sine/sessions/missing/spawners/1");
  assert.equal(missingInspection.status, 404);
  assert.deepEqual(missingInspection.payload, { error: "Not found" });

  const snapshot = await request("POST", "/api/sine/snapshots", {
    persistentSessionId: uniqueTestSessionId("route-snapshot"),
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [],
    deaths: [],
    genomeSnapshots: [],
    stateSnapshots: [],
    foodEvents: [],
    events: [],
    uniquenessSnapshots: [],
  });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.payload.ok, true);
  assert.equal(snapshot.payload.births, 0);

  const malformed = await rawRequest("POST", "/api/sine/sessions", "{");
  assert.equal(malformed.status, 500);
  assert.equal(typeof malformed.payload.error, "string");
}

async function testSineRoutesReturnNotFoundForIncompleteHistoricalSpawnerRows() {
  const sessionId = uniqueTestSessionId("route-incomplete-history");
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  try {
    const snapshot = await request("POST", "/api/sine/snapshots", {
      persistentSessionId: sessionId,
      settings: INITIAL_SETTINGS,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      births: [],
      deaths: [{ tick: 1, spawner }],
      genomeSnapshots: [],
      stateSnapshots: [],
      foodEvents: [],
      events: [{ id: 1, kind: "death", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId }],
      uniquenessSnapshots: [],
    });
    assert.equal(snapshot.status, 200);

    const inspection = await request("GET", `/api/sine/sessions/${encodeURIComponent(sessionId)}/spawners/${spawner.id}`);
    assert.equal(inspection.status, 404);
    assert.deepEqual(inspection.payload, { error: "Not found" });
  } finally {
    deleteSineSession(sessionId);
  }
}

async function testSineRoutesReturnCohortAnalysis() {
  const sessionId = uniqueTestSessionId("route-cohort-analysis");
  try {
    const snapshot = await request("POST", "/api/sine/snapshots", {
      persistentSessionId: sessionId,
      settings: INITIAL_SETTINGS,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      births: [],
      deaths: [],
      genomeSnapshots: [],
      stateSnapshots: [],
      foodEvents: [],
      events: [],
      uniquenessSnapshots: [],
    });
    assert.equal(snapshot.status, 200);

    const cohort = await request("GET", `/api/sine/sessions/${encodeURIComponent(sessionId)}/cohort-analysis?fromPercent=0&toPercent=100&minTrades=50&minAgePercentile=75&bucketCount=20`);
    assert.equal(cohort.status, 200);
    assert.equal(cohort.payload.ok, true);
    assert.equal(cohort.payload.analysis.sessionId, sessionId);
    assert.equal(cohort.payload.analysis.filter.minTrades, 50);
    assert.equal(cohort.payload.analysis.filter.minAgePercentile, 75);
    assert.equal(cohort.payload.analysis.concentration.totalTrades, 0);
    assert.equal(Array.isArray(cohort.payload.analysis.timeline), true);

    const missing = await request("GET", "/api/sine/sessions/missing/cohort-analysis");
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.payload, { error: "Not found" });
  } finally {
    deleteSineSession(sessionId);
  }
}

async function request(method: string, url: string, body?: unknown) {
  return rawRequest(method, url, body === undefined ? undefined : JSON.stringify(body));
}

async function rawRequest(method: string, url: string, body?: string) {
  const req = Readable.from(body === undefined ? [] : [body]) as Readable & { method?: string; url?: string };
  req.method = method;
  req.url = url;
  const chunks: string[] = [];
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
    },
    end(chunk: string) {
      chunks.push(chunk);
    },
  };
  await routeRequest(req, res);
  return {
    status: res.status,
    headers: res.headers,
    payload: JSON.parse(chunks.join("") || "{}"),
  };
}

export const tests: SineTest[] = [
  { name: "Sine Routes Preserve Session Lifecycle Responses", run: testSineRoutesPreserveSessionLifecycleResponses },
  { name: "Sine Routes Preserve Inspection And Snapshot Errors", run: testSineRoutesPreserveInspectionAndSnapshotErrors },
  { name: "Sine Routes Return Not Found For Incomplete Historical Spawner Rows", run: testSineRoutesReturnNotFoundForIncompleteHistoricalSpawnerRows },
  { name: "Sine Routes Return Cohort Analysis", run: testSineRoutesReturnCohortAnalysis },
];
