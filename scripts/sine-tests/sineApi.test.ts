import { strict as assert } from "node:assert";
import { deleteSineSession, getSineSessionAnalysis, getSineSessionCohortAnalysis, getSineSpawnerInspection, listSineSessions } from "../../src/sine/history/sineHistoryApi";
import { getActiveSineHeadlessRuns, startSineHeadlessRun } from "../../src/sine/headless/headlessApi";
import { fetchMarketCandles } from "../../src/sine/worker/marketDataLoader";
import { postSineSnapshot } from "../../src/sine/persistence/sinePersistenceClient";
import {
  admitSineSeedBankCandidate,
  admitSineSeedBankCandidates,
  createSineSeedBank,
  listSineSeedBankCandidates,
  listSineSeedBankCandidateRuns,
  listSineSeedBankEntries,
  listSineSeedBanks,
  updateSineSeedBank,
} from "../../src/sine/seedBankApi";
import { fetchSineJson, getSineJson, sineApiUrl } from "../../src/sine/sineApi";
import { INITIAL_MARKET_RUNTIME_CONFIG, INITIAL_PLAYBACK_SETTINGS } from "../../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

function testSineApiUrlBuildsStableAbsoluteUrls() {
  assert.equal(sineApiUrl("api/sine/sessions", { limit: 10 }), "http://127.0.0.1:8787/api/sine/sessions?limit=10");
  assert.equal(
    sineApiUrl("/api/sine/sessions/a b/spawners/4", new URLSearchParams({ tick: "12" })),
    "http://127.0.0.1:8787/api/sine/sessions/a b/spawners/4?tick=12",
  );
}

async function testSineApiClientsSendExactRequests() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  await withMockFetch(calls, async () => {
    await listSineSessions(7);
    await getSineSessionAnalysis("session/1", { fromPercent: 40, toPercent: 100 });
    await getSineSessionCohortAnalysis("session/1", { fromPercent: 40, toPercent: 100, minTrades: 50, minAgePercentile: 75, bucketCount: 100 });
    await getSineSpawnerInspection("session/1", 4, 12);
    await deleteSineSession("session/1");
    await getActiveSineHeadlessRuns();
    await startSineHeadlessRun({
      ticks: 2000,
      seed: 101,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      minimumResolvedTrades: 10,
      resolvedTradeSnapshotInterval: 25,
      checkpointIntervalTicks: 100,
    });
    await postSineSnapshot({ persistentSessionId: "session/1", births: [] });
    await listSineSeedBanks();
    await createSineSeedBank({ id: "bank/1", label: "Bank", description: "Desc" });
    await updateSineSeedBank("bank/1", { label: "Renamed" });
    await listSineSeedBankEntries("bank/1");
    await listSineSeedBankCandidateRuns(25);
    await listSineSeedBankCandidates({
      runIds: ["run/1", "run/2"],
      bankId: "bank/1",
      minResolvedTrades: 50,
      minChildren: 2,
      minAgePercentile: 75,
      minSharpe: 1.25,
      minSortino: 1.5,
      limit: 100,
      offset: 25,
    });
    await admitSineSeedBankCandidate({
      bankId: "bank/1",
      sourceRunId: "run/1",
      sourceSpawnerId: 7,
      filters: { minResolvedTrades: 50, minChildren: 2, minAgePercentile: 75, minSharpe: 1.25, minSortino: 1.5 },
    });
    await admitSineSeedBankCandidates({
      bankId: "bank/1",
      runIds: ["run/1", "run/2"],
      filters: { minResolvedTrades: 50, minChildren: 2, minAgePercentile: 75, minSharpe: 1.25, minSortino: 1.5 },
    });
    await fetchMarketCandles(
      {
        timeModel: "ticks-v2",
        source: "btcusd_5m",
        generated: {} as never,
        playback: { ...INITIAL_PLAYBACK_SETTINGS, rocLengthBars: 50, startDateTime: "2021-01-01T00:00", generatedTicksPerSecond: 5, barsPerSecond: 30 },
      },
      "2021-01-01T00:00",
      123,
    );
  });

  assert.equal(calls[0]?.url, "http://127.0.0.1:8787/api/sine/sessions?limit=7");
  assert.equal(calls[0]?.init?.method, undefined);
  assert.equal(calls[1]?.url, "http://127.0.0.1:8787/api/sine/sessions/session%2F1/analysis?fromPercent=40&toPercent=100");
  assert.equal(calls[2]?.url, "http://127.0.0.1:8787/api/sine/sessions/session%2F1/cohort-analysis?fromPercent=40&toPercent=100&minTrades=50&minAgePercentile=75&bucketCount=100");
  assert.equal(calls[3]?.url, "http://127.0.0.1:8787/api/sine/sessions/session%2F1/spawners/4?tick=12");
  assert.equal(calls[4]?.url, "http://127.0.0.1:8787/api/sine/sessions/session%2F1");
  assert.equal(calls[4]?.init?.method, "DELETE");
  assert.equal(calls[5]?.url, "http://127.0.0.1:8787/api/sine/headless/runs/active-list");
  assert.equal(calls[5]?.init?.method, undefined);
  assert.equal(calls[6]?.url, "http://127.0.0.1:8787/api/sine/headless/runs");
  assert.equal(calls[6]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[6]?.init?.body)), {
    ticks: 2000,
    seed: 101,
    marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    minimumResolvedTrades: 10,
    resolvedTradeSnapshotInterval: 25,
    checkpointIntervalTicks: 100,
  });
  assert.equal(calls[7]?.url, "http://127.0.0.1:8787/api/sine/snapshots");
  assert.equal(calls[7]?.init?.method, "POST");
  assert.deepEqual(calls[7]?.init?.headers, { "Content-Type": "application/json" });
  assert.equal(calls[7]?.init?.body, JSON.stringify({ persistentSessionId: "session/1", births: [] }));
  assert.equal(calls[8]?.url, "http://127.0.0.1:8787/api/sine/seed-banks");
  assert.equal(calls[8]?.init?.method, undefined);
  assert.equal(calls[9]?.url, "http://127.0.0.1:8787/api/sine/seed-banks");
  assert.equal(calls[9]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[9]?.init?.body)), { id: "bank/1", label: "Bank", description: "Desc" });
  assert.equal(calls[10]?.url, "http://127.0.0.1:8787/api/sine/seed-banks/bank%2F1");
  assert.equal(calls[10]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[10]?.init?.body)), { label: "Renamed" });
  assert.equal(calls[11]?.url, "http://127.0.0.1:8787/api/sine/seed-banks/bank%2F1/entries");
  assert.equal(calls[12]?.url, "http://127.0.0.1:8787/api/sine/seed-bank/candidate-runs?limit=25");
  assert.equal(
    calls[13]?.url,
    "http://127.0.0.1:8787/api/sine/seed-bank/candidates?runIds=run%2F1%2Crun%2F2&bankId=bank%2F1&minResolvedTrades=50&minChildren=2&minAgePercentile=75&minSharpe=1.25&minSortino=1.5&limit=100&offset=25",
  );
  assert.equal(calls[14]?.url, "http://127.0.0.1:8787/api/sine/seed-bank/admissions");
  assert.equal(calls[14]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[14]?.init?.body)), {
    bankId: "bank/1",
    sourceRunId: "run/1",
    sourceSpawnerId: 7,
    filters: { minResolvedTrades: 50, minChildren: 2, minAgePercentile: 75, minSharpe: 1.25, minSortino: 1.5 },
  });
  assert.equal(Object.hasOwn(JSON.parse(String(calls[14]?.init?.body)), "snapshots"), false);
  assert.equal(calls[15]?.url, "http://127.0.0.1:8787/api/sine/seed-bank/admissions/batch");
  assert.equal(calls[15]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[15]?.init?.body)), {
    bankId: "bank/1",
    runIds: ["run/1", "run/2"],
    filters: { minResolvedTrades: 50, minChildren: 2, minAgePercentile: 75, minSharpe: 1.25, minSortino: 1.5 },
  });
  assert.equal(Object.hasOwn(JSON.parse(String(calls[15]?.init?.body)), "snapshots"), false);
  assert.equal(
    calls[16]?.url,
    "http://127.0.0.1:8787/api/market/candles?source=btcusd_5m&start=2021-01-01T00%3A00&limit=123&rocLength=50",
  );
}

async function testSineApiClientsPreserveErrorMessages() {
  await withMockFetch([], async () => {
    await assert.rejects(() => fetchSineJson("/api/sine/sessions"), /Sine API request failed \(503\)/);
    await assert.rejects(() => getSineJson("/api/sine/sessions"), /Sine API request failed \(503\)/);
    await assert.rejects(() => deleteSineSession("missing"), /Could not delete saved run \(503\)/);
    await assert.rejects(() => postSineSnapshot({}), /Persistence failed: 503/);
  }, 503);
}

async function withMockFetch(
  calls: Array<{ url: string; init: RequestInit | undefined }>,
  callback: () => Promise<void>,
  status = 200,
) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        sessions: [],
        analysis: { session: {}, diagnostics: {} },
        payload: {},
        snappedStartTimestamp: 0,
        snappedStartDatetime: "2021-01-01T00:00:00.000Z",
        candles: [{ timestamp: 0, datetime: "2021-01-01T00:00:00.000Z", open: 1, high: 1, low: 1, close: 1, roc: 0, isStart: true }],
      }),
    } as Response;
  }) as typeof fetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

export const tests: SineTest[] = [
  { name: "Sine Api Url Builds Stable Absolute Urls", run: testSineApiUrlBuildsStableAbsoluteUrls },
  { name: "Sine Api Clients Send Exact Requests", run: testSineApiClientsSendExactRequests },
  { name: "Sine Api Clients Preserve Error Messages", run: testSineApiClientsPreserveErrorMessages },
];
