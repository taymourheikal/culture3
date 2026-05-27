import { chromium, expect } from "@playwright/test";
import { delay, SINE_BROWSER_URL, startSineBrowserServer } from "./sineBrowserHarness";

async function main() {
  const server = await startSineBrowserServer();

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    try {
      let candleMode: "pass" | "delay" | "fail" = "pass";
      await page.route("**/api/market/candles**", async (route) => {
        if (candleMode === "fail") {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "forced failure" }) });
          return;
        }
        if (candleMode === "delay") await delay(700);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(syntheticCandleResponse()) });
      });

      const controls = page.locator(".sine-control-actions");
      await page.goto(SINE_BROWSER_URL);
      await expect(page.getByRole("heading", { name: "ROC Signal Lab" })).toBeVisible();
      await expect(controls.getByRole("button", { name: /Play/ })).toBeEnabled();

      await controls.getByRole("button", { name: /Play/ }).click();
      await expect(controls.getByRole("button", { name: "Pause" })).toBeEnabled();
      await expect(page.getByText(/Tick/).first()).toBeVisible();

      await page.getByRole("button", { name: /New Run/ }).click();
      await expect(controls.getByRole("button", { name: /Play/ })).toBeEnabled();

      await controls.getByRole("button", { name: /Play/ }).click();
      await controls.getByRole("button", { name: "Pause" }).click();
      await expect(controls.getByRole("button", { name: /Resume/ })).toBeEnabled();
      await controls.getByRole("button", { name: /Resume/ }).click();
      await expect(controls.getByRole("button", { name: "Stop" })).toBeEnabled();
      await controls.getByRole("button", { name: "Stop" }).click();
      await expect(controls.getByRole("button", { name: /Play/ })).toBeEnabled();

      await page.getByLabel("Simulator parameter menu").getByRole("button", { name: "Market" }).click();
      const amplitudeInput = page.locator("label.sine-slider").filter({ hasText: "Amplitude" }).locator('input[type="number"]').first();
      const originalAmplitude = await amplitudeInput.inputValue();
      await amplitudeInput.clear();
      await expect(amplitudeInput).toHaveValue("");
      await amplitudeInput.blur();
      await expect(amplitudeInput).toHaveValue(originalAmplitude);
      await amplitudeInput.fill("2");
      await expect(amplitudeInput).toHaveValue("2");

      await page.getByLabel("Source").selectOption("btcusd_5m");
      candleMode = "fail";
      await controls.getByRole("button", { name: /Play/ }).click();
      await expect(page.getByText("Sine API request failed (500)")).toBeVisible();

      candleMode = "delay";
      await page.getByRole("button", { name: /New Run/ }).click();
      await controls.getByRole("button", { name: /Play/ }).click();
      await page.getByRole("button", { name: /New Run/ }).click();
      await page.waitForTimeout(900);
      await expect(page.getByText("BTC data request was superseded")).toHaveCount(0);
      await expect(controls.getByRole("button", { name: /Play/ })).toBeEnabled();

      candleMode = "pass";
      await controls.getByRole("button", { name: /Play/ }).click();
      await expect(page.getByText(/BTCUSD 5m|BTC Playback/).first()).toBeVisible();
      await controls.getByRole("button", { name: "Stop" }).click();

      await page.getByLabel("Simulator parameter menu").getByRole("button", { name: "Market" }).click();
      await page.getByLabel("Source").selectOption("generated");
      await page.getByLabel("Simulator parameter menu").getByRole("button", { name: "Spawner Agents" }).click();
      await expect(page.getByText("NN Contract")).toBeVisible();
      const initialSpawnersInput = page.locator("label.sine-slider").filter({ hasText: "Initial spawner agents" }).locator('input[type="number"]').first();
      const maxPopulationInput = page.locator("label.sine-slider").filter({ hasText: "Max population" }).locator('input[type="number"]').first();
      await initialSpawnersInput.fill("500");
      await maxPopulationInput.fill("500");
      await page.getByRole("button", { name: /New Run/ }).click();
      await controls.getByRole("button", { name: /Play/ }).click();
      await expect(page.getByText("sync")).toBeVisible();
      await controls.getByRole("button", { name: "Stop" }).click();

      await page.getByLabel("Food spawner agents").locator("button").first().click();
      await page.locator(".spawner-detail .architecture-open-card").click();
      await expect(page.getByRole("dialog", { name: /RNN architecture/ })).toBeVisible();
      await page.getByLabel("Close architecture inspector").click();

      await page.locator(".spawner-detail .uniqueness-open-card").click();
      await expect(page.getByRole("heading", { name: "Uniqueness" })).toBeVisible();
      await page.getByLabel("Close uniqueness modal").click();

      await expect(page.getByText("SQLite Run Browser")).toBeVisible();
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText(/saved Toy Market runs|No saved Toy Market runs yet|Saved-run browser offline|Saved runs not checked yet|Press Play to create a saved run/).first()).toBeVisible();
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(server.output());
    throw error;
  } finally {
    server.stop();
  }
}

function syntheticCandleResponse() {
  const start = Date.UTC(2021, 0, 1) / 1000;
  const candles = Array.from({ length: 160 }, (_, index) => {
    const close = 30_000 + index * 10 + Math.sin(index / 5) * 120;
    const timestamp = start + index * 300;
    return {
      timestamp,
      datetime: new Date(timestamp * 1000).toISOString(),
      open: close - 6,
      high: close + 12,
      low: close - 12,
      close,
      roc: index === 0 ? 0 : Math.sin(index / 10),
      isStart: index === 50,
    };
  });
  return {
    snappedStartTimestamp: start,
    snappedStartDatetime: new Date(start * 1000).toISOString(),
    candles,
  };
}

void main();
