import { expect, type Page, type Route } from "@playwright/test";
import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";
import {
  cohortAnalysis,
  sessionAnalysis,
  sessionSummary,
  UI_CHARACTERIZATION_COMPARISON_SESSION_ID,
  UI_CHARACTERIZATION_SESSION_ID,
} from "./sine-tests/sineUiFixtures";

const SESSION_ID = UI_CHARACTERIZATION_SESSION_ID;
const COMPARISON_SESSION_ID = UI_CHARACTERIZATION_COMPARISON_SESSION_ID;

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
      await verifyDiagnosticsMiniChartHover(page);
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

async function verifyDiagnosticsMiniChartHover(page: Page) {
  const tradingPanel = page.locator(".sine-workbench-panel", { has: page.getByRole("heading", { name: "Trading Performance" }) });
  const cumulativeChart = tradingPanel.locator(".sine-analysis-mini-chart", { hasText: "Cumulative payoff" }).first();
  const readout = cumulativeChart.locator(".sine-analysis-mini-chart-head strong").first();
  await expect(readout).toHaveText("15.00");
  await expect(cumulativeChart.locator(".sine-analysis-chart-gridlines line")).toHaveCount(6);
  const help = cumulativeChart.locator(".sine-help").first();
  await expect(help).toHaveAttribute("aria-label", /Running sum of resolved trade payoffs/);
  await help.hover();
  await expect(cumulativeChart.locator(".sine-help-tooltip").first()).toBeVisible();

  const svgBounds = await cumulativeChart.getByRole("img", { name: "Cumulative payoff over time" }).boundingBox();
  expect(svgBounds).not.toBeNull();
  if (!svgBounds) return;
  await page.mouse.move(svgBounds.x + 1, svgBounds.y + svgBounds.height / 2);
  await expect(readout).toHaveText("10.00");
}

async function fulfillJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

void main();
