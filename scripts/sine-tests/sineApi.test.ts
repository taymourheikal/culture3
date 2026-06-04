import { strict as assert } from "node:assert";
import { deleteSineSession, getSineSessionAnalysis, getSineSessionCohortAnalysis, getSineSpawnerInspection, listSineSessions } from "../../src/sine/history/sineHistoryApi";
import { fetchMarketCandles } from "../../src/sine/worker/marketDataLoader";
import { postSineSnapshot } from "../../src/sine/persistence/sinePersistenceClient";
import { fetchSineJson, getSineJson, sineApiUrl } from "../../src/sine/sineApi";
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
    await postSineSnapshot({ persistentSessionId: "session/1", births: [] });
    await fetchMarketCandles(
      {
        timeModel: "ticks-v2",
        source: "btcusd_5m",
        generated: {} as never,
        playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", generatedTicksPerSecond: 5, barsPerSecond: 30 },
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
  assert.equal(calls[5]?.url, "http://127.0.0.1:8787/api/sine/snapshots");
  assert.equal(calls[5]?.init?.method, "POST");
  assert.deepEqual(calls[5]?.init?.headers, { "Content-Type": "application/json" });
  assert.equal(calls[5]?.init?.body, JSON.stringify({ persistentSessionId: "session/1", births: [] }));
  assert.equal(
    calls[6]?.url,
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
