import { expect, type Route } from "@playwright/test";
import type { SineSessionAnalysis, SineSessionCohortAnalysis, SineSessionSummary } from "../src/sine/history/sineHistoryTypes";
import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";

const SESSION_ID = "ui-characterization-run";
const COMPARISON_SESSION_ID = "ui-characterization-comparison";

async function main() {
  const server = await startSineBrowserServer();
  try {
    await withSineBrowserPage(async (page) => {
      await page.route("**/api/sine/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/sine/sessions") {
          await fulfillJson(route, { sessions: [sessionSummary(SESSION_ID), sessionSummary(COMPARISON_SESSION_ID)] });
          return;
        }
        if (url.pathname === `/api/sine/sessions/${SESSION_ID}/analysis`) {
          await fulfillJson(route, { ok: true, analysis: sessionAnalysis(SESSION_ID) });
          return;
        }
        if (url.pathname === `/api/sine/sessions/${COMPARISON_SESSION_ID}/analysis`) {
          await fulfillJson(route, { ok: true, analysis: sessionAnalysis(COMPARISON_SESSION_ID, { cumulativePayoff: 9, hitRate: 0.52 }) });
          return;
        }
        if (url.pathname === `/api/sine/sessions/${SESSION_ID}/cohort-analysis`) {
          await fulfillJson(route, { ok: true, analysis: cohortAnalysis() });
          return;
        }
        await fulfillJson(route, { error: "Unhandled characterization route" }, 404);
      });

      await page.goto(SINE_BROWSER_URL);
      await expect(page.getByRole("heading", { name: "Sine Workbench" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Scarcity and survival" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Visible roster sample" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Current run" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Runtime pulse" })).toBeVisible();

      await page.getByLabel("Food spawner agents").locator("button").first().click();
      const selectedPanel = page.locator(".selected-spawner-panel");
      await expect(selectedPanel).toBeVisible();
      await expect(selectedPanel.getByText("Selected Agent")).toBeVisible();
      await expect(selectedPanel.getByRole("button", { name: "RNN" })).toBeVisible();
      await expect(selectedPanel.getByRole("button", { name: "Unique", exact: true })).toBeVisible();
      await expect(selectedPanel.getByText("Strategy Cluster")).toBeVisible();
      await page.locator(".sine-workbench-right").getByRole("button", { name: "Details" }).click();
      await expect(page.getByRole("dialog", { name: "Runtime Diagnostics" })).toBeVisible();
      await expect(page.getByText("Worker Health")).toBeVisible();
      await page.getByRole("button", { name: "Close Runtime Diagnostics" }).click();

      await expect(page.getByText("SQLite Run Browser")).toBeVisible();
      await page.getByRole("button", { name: /ui-chara/ }).first().click();
      await expect(page.getByRole("heading", { name: "Run Health" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Resilience" })).toBeVisible();
      await expect(page.getByText("Death Causes").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Trading Performance" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Trade Quality Distributions" })).toBeVisible();
      await expect(page.getByText("Filtered Cohort Performance").first()).toBeVisible();
      await expect(page.getByText("Regime performance grid").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Risk / Tail Profile" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Population Structure" })).toBeVisible();
      await page.getByLabel("Compare with").selectOption(COMPARISON_SESSION_ID);
      await expect(page.getByRole("heading", { name: "Run Comparison" })).toBeVisible();
      await expect(page.getByText("Cumulative payoff").first()).toBeVisible();

      await page.setViewportSize({ width: 390, height: 820 });
      await expect(page.getByRole("heading", { name: "Run Health" })).toBeVisible();
      await expect(page.getByText("Filtered Cohort Performance").first()).toBeVisible();
      const horizontalOverflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2");
      expect(horizontalOverflow).toBe(false);

      await page.getByRole("button", { name: "Help" }).click();
      await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
      await page.getByRole("link", { name: "Runtime" }).click();
      await expect(page.locator("#runtime")).toBeInViewport();
      await page.getByRole("link", { name: "RNN wiring" }).click();
      await expect(page.locator("#rnn-wiring")).toBeInViewport();
    });
  } catch (error) {
    console.error(server.output());
    throw error;
  } finally {
    server.stop();
  }
}

async function fulfillJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function sessionSummary(id: string): SineSessionSummary {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    status: "stopped",
    births: 3,
    deaths: 1,
    stateSnapshots: 3,
    latestTick: 100,
    settings: { source: "generated" },
  };
}

function sessionAnalysis(id: string, overrides: Partial<SineSessionAnalysis["diagnostics"]["health"]> = {}): SineSessionAnalysis {
  return {
    session: {
      id,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      status: "stopped",
      settings: { source: "generated" },
      spawnerConfig: {},
    },
    diagnostics: {
      range: { startTick: 0, latestTick: 100, fromPercent: 0, toPercent: 100, fromTick: 0, toTick: 100 },
      health: {
        latestTick: 100,
        finalPopulation: 2,
        minPopulation: 1,
        timeWeightedAveragePopulation: 1.8,
        resolvedTrades: 60,
        spawnedTrades: 64,
        pendingTrades: 4,
        wins: 36,
        losses: 24,
        hitRate: 0.6,
        averagePayoff: 0.25,
        cumulativePayoff: 15,
        maxCumulativePayoffDrawdown: -4,
        worstSingleTickPayoff: -2,
        ...overrides,
      },
      resilience: {
        populationSeries: [
          { tick: 0, population: 1 },
          { tick: 50, population: 3 },
          { tick: 100, population: 2 },
        ],
        thresholdTicks: [{ threshold: 300, ticks: 100 }],
        deathCauseSeries: [{ bucketStartTick: 75, bucketEndTick: 79, lowEnergyDeaths: 1, lowHealthDeaths: 0, bothDeaths: 0, unknownDeaths: 0 }],
        unknownDeathCauses: 0,
        churnBuckets: [{ bucketStartTick: 0, bucketEndTick: 4, births: 1, deaths: 0, events: 1 }],
        worstPopulationDrawdown: -1,
        averagePopulationDrawdown: -0.25,
        worstSingleTickPopulationDrop: -1,
        minPopulation: 1,
        maxPopulation: 3,
        timeWeightedAveragePopulation: 1.8,
      },
      tradingPerformance: {
        cumulativePayoffSeries: [
          { tick: 50, cumulativePayoff: 10, drawdown: 0, tickPayoff: 10, trades: 30 },
          { tick: 80, cumulativePayoff: 15, drawdown: 0, tickPayoff: 5, trades: 30 },
        ],
        bucketSeries: [{ bucketStartTick: 50, bucketEndTick: 54, trades: 60, wins: 36, hitRate: 0.6, averagePayoff: 0.25, totalPayoff: 15 }],
        bucketDownsideVolatility: 0.5,
        bucketVaR1: -2,
        bucketCVaR1: -2.5,
        bucketVaR5: -1,
        bucketCVaR5: -1.5,
        maxCumulativePayoffDrawdown: -4,
        worstSingleTickPayoff: -2,
        worstBucket: { bucketStartTick: 50, bucketEndTick: 54, totalPayoff: 15, averagePayoff: 0.25, trades: 60 },
      },
      tradeQuality: {
        filters: [
          tradeQualityFilter("All agents", "No age filter", 0, 0, 0, 3),
          tradeQualityFilter(">=50 trades", "No age filter", 50, 0, 0, 2),
          tradeQualityFilter(">=50 trades · >=75th percentile", ">=75th percentile", 50, 75, 90, 1),
        ],
      },
      riskTail: {
        payoffHistogram: histogramRows(["<-2", "-2..-1", "-1..-0.5", "-0.5..0", "0..0.5", "0.5..1", "1..2", ">=2"], 2),
        worst1PctPayoff: -2,
        worst5PctPayoff: -1,
        worst10PctPayoff: -0.5,
        best1PctPayoff: 2,
        best5PctPayoff: 1,
        best10PctPayoff: 0.5,
        tradeVaR1: -2,
        tradeCVaR1: -2.5,
        tradeVaR5: -1,
        tradeCVaR5: -1.5,
        tradeDownsideVolatility: 0.5,
        averageAbsolutePayoff: 0.75,
        byDirection: [{ direction: "long", trades: 60, hitRate: 0.6, averagePayoff: 0.25, totalPayoff: 15 }],
        byHorizon: [{ bucket: "11-20", trades: 60, hitRate: 0.6, averagePayoff: 0.25, totalPayoff: 15 }],
        byStrength: [{ bucket: "0.75-1", trades: 60, hitRate: 0.6, averagePayoff: 0.25, totalPayoff: 15 }],
      },
      populationStructure: {
        birthDeathTimeline: [{ bucketStartTick: 0, bucketEndTick: 4, births: 1, deaths: 0, events: 1 }],
        maxGenerationEver: 2,
        liveLineageCount: 2,
        topLineageId: 1,
        topLineagePopulationShare: 0.5,
        topLineagePayoffLineageId: 1,
        topLineagePayoffShare: 0.75,
        top3LineagePopulationShare: 1,
        birthsPer1000Ticks: 30,
        deathsPer1000Ticks: 10,
        ageSummary: summaryStats(3, 80),
        ageHistogram: histogramRows(["0-99", "100-249", "250-499", "500-999", "1k-2.5k", "2.5k-5k", "5k-10k", ">=10k"], 3),
      },
    },
  };
}

function cohortAnalysis(): SineSessionCohortAnalysis {
  const timeline = Array.from({ length: 100 }, (_, index) => ({
    index,
    bucketStartTick: index,
    bucketEndTick: index,
    tick: index,
    trades: index === 50 ? 60 : 0,
    uniqueAgents: index === 50 ? 2 : 0,
    wins: index === 50 ? 36 : 0,
    losses: index === 50 ? 24 : 0,
    hitRate: index === 50 ? 0.6 : null,
    averagePayoff: index === 50 ? 0.25 : 0,
    totalPayoff: index === 50 ? 15 : 0,
    cumulativePayoff: index >= 50 ? 15 : 0,
    drawdown: 0,
    longCount: index === 50 ? 40 : 0,
    shortCount: index === 50 ? 20 : 0,
    trend: index === 50 ? "up" as const : "unknown" as const,
    volatility: index === 50 ? "low" as const : "unknown" as const,
  }));
  return {
    sessionId: SESSION_ID,
    range: { startTick: 0, latestTick: 100, fromPercent: 0, toPercent: 100, fromTick: 0, toTick: 100 },
    filter: { minTrades: 50, minAgePercentile: 0, minAgeTicks: 0, eligibleAgents: 2, activeAgents: 2 },
    bucketCount: 100,
    market: { source: "generated", regimeStatus: "unknown", snappedStartTimestamp: null },
    timeline,
    regimeGrid: [
      { trend: "up", volatility: "low", trades: 60, uniqueAgents: 2, wins: 36, losses: 24, hitRate: 0.6, averagePayoff: 0.25, totalPayoff: 15 },
      ...["medium", "high", "unknown"].map((volatility) => emptyRegimeCell("up", volatility)),
      ...["flat", "down", "unknown"].flatMap((trend) => ["low", "medium", "high", "unknown"].map((volatility) => emptyRegimeCell(trend, volatility))),
    ],
    concentration: {
      totalTrades: 60,
      activeAgents: 2,
      activeBucketCount: 1,
      activeBucketCoverage: 0.01,
      topAgentTradeShare: 0.6,
      topAgentAbsolutePayoffShare: 0.7,
      topLineageTradeShare: 0.8,
      timingOverlapScore: 0.4,
    },
  };
}

function emptyRegimeCell(trend: string, volatility: string) {
  return { trend, volatility, trades: 0, uniqueAgents: 0, wins: 0, losses: 0, hitRate: null, averagePayoff: 0, totalPayoff: 0 } as SineSessionCohortAnalysis["regimeGrid"][number];
}

function tradeQualityFilter(label: string, ageLabel: string, minTrades: number, minAgePercentile: number, minAgeTicks: number, eligibleAgents: number) {
  return {
    label,
    ageLabel,
    minTrades,
    minAgePercentile,
    minAgeTicks,
    eligibleAgents,
    undefinedSharpeAgents: 0,
    agentsAboveSharpe075: Math.max(0, eligibleAgents - 1),
    undefinedSortinoAgents: 0,
    agentsAboveSortino075: Math.max(0, eligibleAgents - 1),
    sharpeSummary: summaryStats(eligibleAgents, 1.2),
    sortinoSummary: summaryStats(eligibleAgents, 1.5),
    downsideVolatilitySummary: summaryStats(eligibleAgents, 0.4),
    sharpeHistogram: histogramRows(["<-0.5", "-0.5..0", "0..0.25", "0.25..0.5", "0.5..0.75", "0.75..1", "1..1.5", "1.5..2", ">=2"], eligibleAgents),
    sortinoHistogram: histogramRows(["<-0.5", "-0.5..0", "0..0.25", "0.25..0.5", "0.5..0.75", "0.75..1", "1..1.5", "1.5..2", ">=2"], eligibleAgents),
    downsideVolatilityHistogram: histogramRows(["0", "0..0.1", "0.1..0.25", "0.25..0.5", "0.5..1", "1..2", ">=2"], eligibleAgents),
    averagePayoffHistogram: histogramRows(["<-1", "-1..-0.5", "-0.5..0", "0..0.25", "0.25..0.5", "0.5..1", ">=1"], eligibleAgents),
    hitRateHistogram: histogramRows(["<40%", "40-50%", "50-60%", "60-70%", "70-80%", "80-90%", ">=90%"], eligibleAgents),
    resolvedTradesHistogram: histogramRows(["0-9", "10-24", "25-49", "50-99", "100-249", "250-499", ">=500"], eligibleAgents),
  };
}

function summaryStats(count: number, value: number) {
  return {
    count,
    mean: count > 0 ? value : null,
    min: count > 0 ? value : null,
    p25: count > 0 ? value : null,
    median: count > 0 ? value : null,
    p75: count > 0 ? value : null,
    p90: count > 0 ? value : null,
    p95: count > 0 ? value : null,
    max: count > 0 ? value : null,
  };
}

function histogramRows(labels: string[], totalCount: number) {
  return labels.map((label, index) => ({ label, min: null, max: null, count: index === Math.floor(labels.length / 2) ? totalCount : 0 }));
}

void main();
