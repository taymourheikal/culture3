import { Readable } from "node:stream";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SineTest } from "./helpers";
import { uniqueTestSessionId } from "./helpers";
import { seedCandidateRun, insertBirth, insertSession } from "./seedBankCandidates.test";
// @ts-expect-error The server module is runtime ESM loaded by tsx for integration coverage.
import { routeSineSeedBankRequest } from "../../server/sineSeedBankRoutes.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { createSineSeedBankRepository } from "../../server/sineSeedBankRepository.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession } from "../../server/sineRepository.mjs";

async function testSeedBankRoutesManageBanksAndEntries() {
  await withRouteHarness(async (request) => {
    const missingLabel = await request("POST", "/api/sine/seed-banks", { label: "" });
    assert.equal(missingLabel.status, 400);
    assert.deepEqual(missingLabel.payload, { error: "Missing seed bank label" });

    const created = await request("POST", "/api/sine/seed-banks", { id: "bank-routes", label: "Route Bank", description: "Initial" });
    assert.equal(created.status, 200);
    assert.equal(created.payload.ok, true);
    assert.equal(created.payload.seedBank.id, "bank-routes");

    const listed = await request("GET", "/api/sine/seed-banks");
    assert.equal(listed.status, 200);
    assert.equal(listed.payload.seedBanks.some((bank: any) => bank.id === "bank-routes"), true);

    const updated = await request("PATCH", "/api/sine/seed-banks/bank-routes", { label: "Updated Bank", description: "Updated" });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.seedBank.label, "Updated Bank");
    assert.equal(updated.payload.seedBank.description, "Updated");

    const entries = await request("GET", "/api/sine/seed-banks/bank-routes/entries");
    assert.equal(entries.status, 200);
    assert.deepEqual(entries.payload.entries, []);

    const missingEntries = await request("GET", "/api/sine/seed-banks/missing/entries");
    assert.equal(missingEntries.status, 404);
    assert.deepEqual(missingEntries.payload, { error: "Not found" });
  });
}

async function testSeedBankRoutesListCandidatesAndAdmitSourceReferences() {
  const runId = uniqueTestSessionId("test-sine-seed-route-admit");
  const labRunId = uniqueTestSessionId("test-sine-seed-route-lab");
  try {
    seedCandidateRun(runId, "headless");
    seedCandidateRun(labRunId, "lab");
    await withRouteHarness(async (request) => {
      await request("POST", "/api/sine/seed-banks", { id: "bank-route-candidates", label: "Candidates" });

      const sourceRuns = await request("GET", "/api/sine/seed-bank/candidate-runs?limit=100");
      assert.equal(sourceRuns.status, 200);
      const sourceIds = sourceRuns.payload.runs.filter((run: any) => run.id === runId || run.id === labRunId).map((run: any) => run.id);
      assert.deepEqual(sourceIds, [runId]);

      const invalidFilter = await request("GET", `/api/sine/seed-bank/candidates?runIds=${encodeURIComponent(runId)}&minResolvedTrades=abc`);
      assert.equal(invalidFilter.status, 400);
      assert.deepEqual(invalidFilter.payload, { error: "Invalid minResolvedTrades" });

      const candidates = await request(
        "GET",
        `/api/sine/seed-bank/candidates?runIds=${encodeURIComponent(`${runId},${labRunId}`)}&bankId=bank-route-candidates&minResolvedTrades=3&minChildren=1&minAgePercentile=50&minSharpe=0.4&minSortino=1`,
      );
      assert.equal(candidates.status, 200);
      assert.equal(candidates.payload.ok, true);
      assert.equal(candidates.payload.total, 1);
      assert.equal(candidates.payload.admittableTotal, 1);
      assert.deepEqual(candidates.payload.rows.map((row: any) => row.spawnerId), [1]);
      assert.equal(candidates.payload.rows[0].runId, runId);
      assert.equal(candidates.payload.rows[0].alreadyAdmitted, false);
      assert.equal(candidates.payload.rows[0].reconstructionSnapshotCount, 4);

      const admission = await request("POST", "/api/sine/seed-bank/admissions", {
        bankId: "bank-route-candidates",
        sourceRunId: runId,
        sourceSpawnerId: 1,
        filters: { minResolvedTrades: 3, minChildren: 1, minAgePercentile: 50, minSharpe: 0.4, minSortino: 1 },
      });
      assert.equal(admission.status, 200);
      assert.equal(admission.payload.ok, true);
      assert.equal(admission.payload.inserted, true);
      assert.equal(admission.payload.entry.source.runId, runId);
      assert.equal(admission.payload.entry.source.spawnerId, 1);
      assert.equal(admission.payload.entry.snapshots.length, 4);
      assert.deepEqual(admission.payload.entry.snapshots.map((snapshot: any) => snapshot.sourceReason), ["birth", "reproduction", "trade_interval", "final"]);

      const duplicate = await request("POST", "/api/sine/seed-bank/admissions", {
        bankId: "bank-route-candidates",
        sourceRunId: runId,
        sourceSpawnerId: 1,
      });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.payload.inserted, false);
      assert.equal(duplicate.payload.entry.id, admission.payload.entry.id);

      const admittedCandidates = await request("GET", `/api/sine/seed-bank/candidates?runIds=${encodeURIComponent(runId)}&bankId=bank-route-candidates&limit=10`);
      assert.equal(admittedCandidates.status, 200);
      assert.equal(admittedCandidates.payload.admittableTotal, 2);
      assert.equal(admittedCandidates.payload.rows.find((row: any) => row.spawnerId === 1).alreadyAdmitted, true);

      deleteSineSession(runId);
      const entries = await request("GET", "/api/sine/seed-banks/bank-route-candidates/entries");
      assert.equal(entries.status, 200);
      assert.equal(entries.payload.entries.length, 1);
      assert.equal(Object.hasOwn(entries.payload.entries[0], "snapshots"), false);

      const detail = await request("GET", `/api/sine/seed-bank/entries/${encodeURIComponent(entries.payload.entries[0].id)}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.payload.entry.id, entries.payload.entries[0].id);
      assert.equal(detail.payload.entry.snapshots.length, 4);
    });
  } finally {
    deleteSineSession(runId);
    deleteSineSession(labRunId);
  }
}

async function testSeedBankRoutesBatchAdmitCandidatesAndRejectInvalidPayloads() {
  const runId = uniqueTestSessionId("test-sine-seed-route-batch");
  try {
    seedCandidateRun(runId, "headless");
    await withRouteHarness(async (request) => {
      await request("POST", "/api/sine/seed-banks", { id: "bank-route-batch", label: "Batch" });

      const invalidMissingRuns = await request("POST", "/api/sine/seed-bank/admissions/batch", {
        bankId: "bank-route-batch",
        runIds: [],
      });
      assert.equal(invalidMissingRuns.status, 400);
      assert.deepEqual(invalidMissingRuns.payload, { error: "Missing source run ids" });

      const invalidFilters = await request("POST", "/api/sine/seed-bank/admissions/batch", {
        bankId: "bank-route-batch",
        runIds: [runId],
        filters: { minChildren: -1 },
      });
      assert.equal(invalidFilters.status, 400);
      assert.deepEqual(invalidFilters.payload, { error: "Invalid minChildren" });

      const admission = await request("POST", "/api/sine/seed-bank/admissions/batch", {
        bankId: "bank-route-batch",
        runIds: [runId],
        filters: { minResolvedTrades: 2 },
      });
      assert.equal(admission.status, 200);
      assert.deepEqual(
        {
          ok: admission.payload.ok,
          matched: admission.payload.matched,
          alreadyAdmitted: admission.payload.alreadyAdmitted,
          attempted: admission.payload.attempted,
          inserted: admission.payload.inserted,
          failed: admission.payload.failed,
        },
        { ok: true, matched: 2, alreadyAdmitted: 0, attempted: 2, inserted: 2, failed: 0 },
      );
      assert.deepEqual(admission.payload.errors, []);

      const duplicate = await request("POST", "/api/sine/seed-bank/admissions/batch", {
        bankId: "bank-route-batch",
        runIds: [runId],
        filters: { minResolvedTrades: 2 },
      });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.payload.matched, 2);
      assert.equal(duplicate.payload.alreadyAdmitted, 2);
      assert.equal(duplicate.payload.attempted, 0);
      assert.equal(duplicate.payload.inserted, 0);

      const entries = await request("GET", "/api/sine/seed-banks/bank-route-batch/entries");
      assert.equal(entries.status, 200);
      assert.equal(entries.payload.entries.length, 2);
    });
  } finally {
    deleteSineSession(runId);
  }
}

async function testSeedBankRoutesHandleMissingAdmissionSources() {
  const missingSnapshotRunId = uniqueTestSessionId("test-sine-seed-route-missing-snapshots");
  const reconstructableRunId = uniqueTestSessionId("test-sine-seed-route-missing-bank");
  try {
    insertSession(missingSnapshotRunId, "headless", 100);
    insertBirth(missingSnapshotRunId, 20, 1, 0, null, 0);
    seedCandidateRun(reconstructableRunId, "headless");
    await withRouteHarness(async (request) => {
      await request("POST", "/api/sine/seed-banks", { id: "bank-route-errors", label: "Errors" });

      const missingBank = await request("POST", "/api/sine/seed-bank/admissions", {
        bankId: "missing-bank",
        sourceRunId: reconstructableRunId,
        sourceSpawnerId: 1,
      });
      assert.equal(missingBank.status, 404);
      assert.match(missingBank.payload.error, /Seed bank not found/);

      const missingRun = await request("POST", "/api/sine/seed-bank/admissions", {
        bankId: "bank-route-errors",
        sourceRunId: "missing-run",
        sourceSpawnerId: 20,
      });
      assert.equal(missingRun.status, 404);
      assert.match(missingRun.payload.error, /Headless source run not found/);

      const missingSnapshots = await request("POST", "/api/sine/seed-bank/admissions", {
        bankId: "bank-route-errors",
        sourceRunId: missingSnapshotRunId,
        sourceSpawnerId: 20,
      });
      assert.equal(missingSnapshots.status, 404);
      assert.match(missingSnapshots.payload.error, /Reconstructable seed-bank candidate not found/);

      const entries = await request("GET", "/api/sine/seed-banks/bank-route-errors/entries");
      assert.equal(entries.status, 200);
      assert.deepEqual(entries.payload.entries, []);
    });
  } finally {
    deleteSineSession(missingSnapshotRunId);
    deleteSineSession(reconstructableRunId);
  }
}

async function testSeedBankRoutesRejectBadBodiesAndDuplicateIds() {
  await withRouteHarness(async (request, requestRaw) => {
    const malformed = await requestRaw("POST", "/api/sine/seed-banks", "{");
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.payload, { error: "Malformed JSON body" });

    const bodyBank = await request("POST", "/api/sine/seed-banks", { id: "bank-body", label: "Body" });
    assert.equal(bodyBank.status, 200);

    const nullBody = await requestRaw("PATCH", "/api/sine/seed-banks/bank-body", "null");
    assert.equal(nullBody.status, 400);
    assert.deepEqual(nullBody.payload, { error: "Invalid JSON body" });

    const arrayBody = await requestRaw("POST", "/api/sine/seed-bank/admissions", "[]");
    assert.equal(arrayBody.status, 400);
    assert.deepEqual(arrayBody.payload, { error: "Invalid JSON body" });

    const first = await request("POST", "/api/sine/seed-banks", { id: "bank-duplicate", label: "Duplicate" });
    assert.equal(first.status, 200);
    const duplicate = await request("POST", "/api/sine/seed-banks", { id: "bank-duplicate", label: "Duplicate" });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(duplicate.payload, { error: "Seed bank already exists" });
  });
}

async function testSeedBankRoutesRejectNearMissesAndCreateDependenciesLazily() {
  const nearMiss = await rawRequestWithFactories("GET", "/api/sine/seed-bankrupt", undefined, {
    repositoryFactory: () => {
      throw new Error("repository should not be constructed");
    },
    candidateServiceFactory: () => {
      throw new Error("candidate service should not be constructed");
    },
    expectedHandled: false,
  });
  assert.equal(nearMiss.handled, false);

  let repositoryConstructions = 0;
  let candidateConstructions = 0;
  const candidateRuns = await rawRequestWithFactories("GET", "/api/sine/seed-bank/candidate-runs?limit=1", undefined, {
    repositoryFactory: () => {
      repositoryConstructions += 1;
      throw new Error("repository should not be constructed");
    },
    candidateServiceFactory: () => {
      candidateConstructions += 1;
      throw new Error("candidate service should not be constructed");
    },
    expectedHandled: true,
  });
  assert.equal(candidateRuns.status, 200);
  assert.equal(repositoryConstructions, 0);
  assert.equal(candidateConstructions, 0);

  await withRouteHarness(async (request) => {
    await request("GET", "/api/sine/seed-banks");
  }, {
    candidateServiceFactory: () => {
      throw new Error("candidate service should not be constructed");
    },
  });
}

async function withRouteHarness(
  callback: (request: (method: string, url: string, body?: unknown) => Promise<any>, requestRaw: (method: string, url: string, rawBody?: string) => Promise<any>) => Promise<void>,
  options: { candidateServiceFactory?: any } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "sine-seed-bank-routes-"));
  const repository = createSineSeedBankRepository({ dbPath: join(dir, "seed-bank.sqlite") });
  try {
    const request = (method: string, url: string, body?: unknown) => rawRequest(method, url, body, repository, options);
    const requestRaw = (method: string, url: string, rawBody?: string) => rawRequestText(method, url, rawBody, repository, options);
    await callback(request, requestRaw);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function rawRequest(method: string, url: string, body: unknown, repository: any, options: { candidateServiceFactory?: any } = {}) {
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  return rawRequestText(method, url, encodedBody, repository, options);
}

async function rawRequestText(method: string, url: string, encodedBody: string | undefined, repository: any, options: { candidateServiceFactory?: any } = {}) {
  const req = Readable.from(encodedBody === undefined ? [] : [encodedBody]) as Readable & { method?: string; url?: string };
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
  const handled = await routeSineSeedBankRequest({
    req,
    res,
    url: new URL(url, "http://localhost"),
    readBody,
    sendJson,
    notFound,
    repository,
    candidateServiceFactory: options.candidateServiceFactory,
  });
  assert.equal(handled, true);
  return {
    status: res.status,
    headers: res.headers,
    payload: JSON.parse(chunks.join("") || "{}"),
  };
}

async function rawRequestWithFactories(
  method: string,
  url: string,
  body: unknown,
  {
    repositoryFactory,
    candidateServiceFactory,
    expectedHandled,
  }: {
    repositoryFactory?: any;
    candidateServiceFactory?: any;
    expectedHandled: boolean;
  },
) {
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  const req = Readable.from(encodedBody === undefined ? [] : [encodedBody]) as Readable & { method?: string; url?: string };
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
  const handled = await routeSineSeedBankRequest({
    req,
    res,
    url: new URL(url, "http://localhost"),
    readBody,
    sendJson,
    notFound,
    repositoryFactory,
    candidateServiceFactory,
  });
  assert.equal(handled, expectedHandled);
  return {
    handled,
    status: res.status,
    headers: res.headers,
    payload: JSON.parse(chunks.join("") || "{}"),
  };
}

function readBody(req: Readable) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: any, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function notFound(res: any) {
  sendJson(res, 404, { error: "Not found" });
}

export const tests: SineTest[] = [
  { name: "Seed Bank Routes Manage Banks And Entries", run: testSeedBankRoutesManageBanksAndEntries },
  { name: "Seed Bank Routes List Candidates And Admit Source References", run: testSeedBankRoutesListCandidatesAndAdmitSourceReferences },
  { name: "Seed Bank Routes Batch Admit Candidates And Reject Invalid Payloads", run: testSeedBankRoutesBatchAdmitCandidatesAndRejectInvalidPayloads },
  { name: "Seed Bank Routes Handle Missing Admission Sources", run: testSeedBankRoutesHandleMissingAdmissionSources },
  { name: "Seed Bank Routes Reject Bad Bodies And Duplicate Ids", run: testSeedBankRoutesRejectBadBodiesAndDuplicateIds },
  { name: "Seed Bank Routes Reject Near Misses And Create Dependencies Lazily", run: testSeedBankRoutesRejectNearMissesAndCreateDependenciesLazily },
];
