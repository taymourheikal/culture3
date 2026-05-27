import { chromium } from "playwright";

const url = process.env.RNN_EXPLAINER_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 1440, height: 1000 },
  { width: 390, height: 900 },
];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });

    const lessons = await page.locator(".lesson-button").count();
    if (lessons !== 7) throw new Error(`Expected 7 lessons, found ${lessons}`);
    const modelTabs = await page.locator(".model-tabs button").count();
    if (modelTabs !== 5) throw new Error(`Expected 5 model tabs, found ${modelTabs}`);

    for (let index = 0; index < lessons; index += 1) {
      await page.locator(".lesson-button").nth(index).click();
      await page.getByRole("button", { name: "Step" }).click();
      const rows = await page.locator("tbody tr").count();
      const svgBox = await page.locator("svg").boundingBox();
      const title = await page.locator(".lesson-hero h2").textContent();
      if (!title || rows < 1 || !svgBox || svgBox.width < 300 || svgBox.height < 400) {
        throw new Error(`Bad lesson render ${index + 1}: ${JSON.stringify({ title, rows, svgBox })}`);
      }
    }

    await page.locator("#scenario-select").selectOption("flip-direction");
    await page.locator(".model-tabs button").nth(4).click();
    await page.getByRole("button", { name: "Step", exact: true }).click();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Remember", exact: true }).click();
    await page.locator(".node.clickable").first().click();
    const explanation = await page.locator(".explain-box p").textContent();
    if (!explanation || explanation.includes("Click any")) throw new Error("Clickable explanation did not update");

    if (errors.length > 0) throw new Error(errors.join("\n"));
    await page.close();
    console.log(`smoke ok ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
