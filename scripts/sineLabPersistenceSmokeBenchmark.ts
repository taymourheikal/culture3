import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { delay, isServerReady, SINE_BROWSER_URL, startSineBrowserServer } from "./sineBrowserHarness";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG } from "../src/sine/spawner/config";
import { parseFlagArgs, readIntegerOption, readIntegerListOption, roundKb } from "./sine-benchmark/cli";

const MARKET_RUNTIME_STORAGE_KEY = "roc-signal-lab.runtime-settings.v1";
const SPAWNER_STORAGE_KEY = "roc-signal-lab.spawner-settings.v1";

type CliOptions = {
  populations: number[];
  minTick: number;
  maxWaitMs: number;
  db?: string;
};

type SessionSummary = {
  id: string;
  births: number;
  deaths: number;
  stateSnapshots: number;
  latestTick: number;
  status: string;
  settings?: Record<string, unknown>;
  spawnerConfig?: {
    initialSpawners?: number;
    maxSpawners?: number;
  };
};

const options = parseArgs(process.argv.slice(2));
const alreadyRunning = await isServerReady();
const tempDir = options.db || alreadyRunning ? null : mkdtempSync(join(tmpdir(), "sine-lab-smoke-benchmark-"));
const dbPath = options.db ?? (tempDir ? join(tempDir, "toy-market.sqlite") : null);
if (dbPath && !alreadyRunning) process.env.SINE_DB_PATH = dbPath;

const server = await startSineBrowserServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const consoleMessages: string[] = [];
const pageErrors: string[] = [];
const persistenceRequests: Array<{ population: number; path: string; kb: number; status: number | null }> = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleMessages.push(message.text());
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});
page.on("request", (request) => {
  const url = new URL(request.url());
  if (request.method() !== "POST" || !isPersistencePath(url.pathname)) return;
  persistenceRequests.push({
    population: currentPopulation,
    path: url.pathname,
    kb: roundKb((request.postData() ?? "").length / 1024),
    status: null,
  });
});
page.on("response", (response) => {
  const url = new URL(response.url());
  if (!isPersistencePath(url.pathname)) return;
  const pending = [...persistenceRequests].reverse().find((entry) => entry.path === url.pathname && entry.status === null);
  if (pending) pending.status = response.status();
});

let currentPopulation = 0;

try {
  const beforeSessions = await listSessions();
  const beforeIds = new Set(beforeSessions.map((session) => session.id));
  const runs = [];

  for (const population of options.populations) {
    currentPopulation = population;
    await loadBenchmarkLab(page, population);
    const controls = page.getByRole("region", { name: "Run controls" });
    const runStartedAt = Date.now();
    await page.getByRole("button", { name: /New Run/ }).click();
    await controls.getByRole("button", { name: /Play/ }).click();
    const session = await waitForBenchmarkSession(beforeIds, options.minTick, options.maxWaitMs);
    assertBenchmarkConfig(session, population);
    const bodyTextAtTarget = await page.locator("body").innerText();
    await controls.getByRole("button", { name: "Stop" }).click();
    await expect(controls.getByRole("button", { name: /Play/ })).toBeEnabled({ timeout: 10_000 });
    const stoppedSession = await waitForSessionStopped(session.id, 20_000);
    beforeIds.add(session.id);
    runs.push({
      population,
      elapsedMs: Date.now() - runStartedAt,
      session: stoppedSession ?? session,
      visibleMetrics: extractVisibleMetrics(bodyTextAtTarget),
      persistenceRequests: persistenceRequests.filter((entry) => entry.population === population),
    });
  }

  const benchmarkSessionIds = runs.map((run) => run.session.id);
  await cleanupSessions(benchmarkSessionIds);
  console.log(JSON.stringify({
    ok: true,
    browserPath: SINE_BROWSER_URL,
    serverMode: alreadyRunning ? "existing-server" : "benchmark-started-server",
    dbPath: dbPath ?? "existing-server-db",
    productionDbTouched: alreadyRunning && !options.db,
    settings: {
      populations: options.populations,
      minTick: options.minTick,
      maxWaitMs: options.maxWaitMs,
    },
    runs,
    consoleErrors: consoleMessages,
    pageErrors,
    dbSizeKb: dbPath ? roundKb(dbSizeBytes(dbPath) / 1024) : null,
    cleanup: {
      attemptedSessionIds: benchmarkSessionIds,
    },
  }, null, 2));
} catch (error) {
  console.error(server.output());
  throw error;
} finally {
  await browser.close();
  server.stop();
}

async function loadBenchmarkLab(page: Page, population: number) {
  await page.goto(SINE_BROWSER_URL);
  await page.evaluate(
    ({ marketKey, spawnerKey, marketConfig, spawnerConfig }) => {
      localStorage.setItem(marketKey, JSON.stringify(marketConfig));
      localStorage.setItem(spawnerKey, JSON.stringify(spawnerConfig));
    },
    {
      marketKey: MARKET_RUNTIME_STORAGE_KEY,
      spawnerKey: SPAWNER_STORAGE_KEY,
      marketConfig: { ...INITIAL_MARKET_RUNTIME_CONFIG, source: "generated" },
      spawnerConfig: { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: population, maxSpawners: population },
    },
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sine Workbench" })).toBeVisible();
}

async function waitForBenchmarkSession(beforeIds: Set<string>, minTick: number, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sessions = await listSessions();
    const session = sessions
      .filter((entry) => !beforeIds.has(entry.id))
      .sort((left, right) => (right.latestTick ?? 0) - (left.latestTick ?? 0))[0];
    if (session && session.latestTick >= minTick) return session;
    await delay(500);
  }
  const sessions = await listSessions();
  const session = sessions
    .filter((entry) => !beforeIds.has(entry.id))
    .sort((left, right) => (right.latestTick ?? 0) - (left.latestTick ?? 0))[0];
  if (session) {
    throw new Error(`Timed out waiting for Lab session ${session.id} to reach tick ${minTick}; latest tick was ${session.latestTick ?? 0}`);
  }
  throw new Error(`Timed out waiting for Lab session to reach tick ${minTick}`);
}

async function waitForSessionStopped(sessionId: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = (await listSessions()).find((entry) => entry.id === sessionId);
    if (session?.status === "stopped") return session;
    await delay(500);
  }
  return null;
}

async function listSessions(): Promise<SessionSummary[]> {
  const response = await fetch("http://127.0.0.1:8787/api/sine/sessions?limit=100");
  if (!response.ok) throw new Error(`Could not list sessions: ${response.status}`);
  const payload = await response.json() as { sessions?: SessionSummary[] };
  return payload.sessions ?? [];
}

async function cleanupSessions(sessionIds: string[]) {
  for (const sessionId of sessionIds) {
    await fetch(`http://127.0.0.1:8787/api/sine/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
  }
}

function extractVisibleMetrics(bodyText: string) {
  return {
    tickLine: metricLine(bodyText, "Tick"),
    backlogLine: metricLine(bodyText, "Backlog"),
    packetLine: metricLine(bodyText, "Persistence"),
    runtimeModeLine: metricLine(bodyText, "Brain eval"),
    rawLength: bodyText.length,
  };
}

function metricLine(bodyText: string, label: string) {
  const line = bodyText.split("\n").find((entry) => entry.toLowerCase().includes(label.toLowerCase()));
  return line?.trim() ?? null;
}

function isPersistencePath(pathname: string) {
  return pathname === "/api/sine/events" || pathname === "/api/sine/snapshots";
}

function assertBenchmarkConfig(session: SessionSummary, population: number) {
  const initialSpawners = session.spawnerConfig?.initialSpawners;
  const maxSpawners = session.spawnerConfig?.maxSpawners;
  if (initialSpawners !== population || maxSpawners !== population) {
    throw new Error(
      `Lab smoke config mismatch for requested population ${population}: initial=${initialSpawners ?? "unknown"} max=${maxSpawners ?? "unknown"}`,
    );
  }
}

function dbSizeBytes(dbPath: string) {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].reduce((sum, path) => sum + (existsSync(path) ? statSync(path).size : 0), 0);
}

function parseArgs(args: string[]): CliOptions {
  const values = parseFlagArgs(args);
  return {
    populations: readIntegerListOption(values, "populations", [100, 250], 1),
    minTick: readIntegerOption(values, "min-tick", 1000, 1),
    maxWaitMs: readIntegerOption(values, "max-wait-ms", 180000, 1000),
    db: values.get("db"),
  };
}
