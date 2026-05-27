import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

export const SINE_BROWSER_URL = "http://127.0.0.1:5173/sine.html";

export type SineBrowserServer = {
  server: ChildProcessWithoutNullStreams | null;
  output: () => string;
  stop: () => void;
};

export async function startSineBrowserServer(baseUrl = SINE_BROWSER_URL): Promise<SineBrowserServer> {
  const alreadyRunning = await isServerReady(baseUrl);
  const server = alreadyRunning
    ? null
    : spawn("npm", ["run", "dev"], {
        cwd: process.cwd(),
        stdio: "pipe",
        env: { ...process.env, BROWSER: "none" },
      });
  let output = "";
  server?.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server?.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  if (server) await waitForServer(server, baseUrl);
  return {
    server,
    output: () => output,
    stop: () => stopServer(server),
  };
}

export async function withSineBrowserPage<T>(
  run: (page: Page, browser: Browser) => Promise<T>,
  options: BrowserContextOptions = {},
) {
  const browser = await chromium.launch();
  const page = await browser.newPage(options);
  try {
    return await run(page, browser);
  } finally {
    await browser.close();
  }
}

export async function isServerReady(baseUrl = SINE_BROWSER_URL) {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForServer(server: ChildProcessWithoutNullStreams, baseUrl = SINE_BROWSER_URL) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (server.exitCode !== null) throw new Error(`dev server exited with ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("Timed out waiting for sine browser server");
}

export function stopServer(server: ChildProcessWithoutNullStreams | null) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
