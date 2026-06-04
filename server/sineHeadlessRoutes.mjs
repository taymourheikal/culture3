import {
  cancelSineHeadlessJob,
  getActiveSineHeadlessJob,
  getLatestSineHeadlessRun,
  getSineHeadlessJob,
  sanitizeSineHeadlessJobOptions,
  startSineHeadlessJob,
} from "./sineHeadlessJobs.mjs";
import { timeBenchmarkQuery } from "./benchmarkInstrumentation.mjs";
import { createSineHeadlessRepository } from "./sineHeadlessRepository.mjs";

export async function routeSineHeadlessRequest({ req, res, url, readBody, sendJson, notFound }) {
  if (req.method === "GET" && url.pathname === "/api/sine/headless/runs/active") {
    sendJson(res, 200, { ok: true, job: getActiveSineHeadlessJob() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/sine/headless/runs/latest") {
    const result = getLatestSineHeadlessRun();
    if (!result) {
      sendJson(res, 200, { ok: true, run: null, checkpoints: [], counts: null, active: false });
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sine/headless/runs") {
    const payload = JSON.parse(await readBody(req));
    const result = startSineHeadlessJob(sanitizeSineHeadlessJobOptions(payload));
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return true;
    }
    sendJson(res, 200, { ok: true, job: result.job });
    return true;
  }

  const leaderboardMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/analysis\/agents$/);
  if (req.method === "GET" && leaderboardMatch) {
    const runId = readRunId(leaderboardMatch);
    const result = withHeadlessRepository("headless.analysis.agents", (repository) => {
      if (!repository.getRun(runId)) return null;
      return repository.listAgentLeaderboard(runId, {
        sortKey: url.searchParams.get("sortKey") ?? undefined,
        sortDirection: url.searchParams.get("sortDirection") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined,
        minResolvedTrades: url.searchParams.get("minResolvedTrades") ?? undefined,
        alive: url.searchParams.get("alive") ?? undefined,
        lineageId: url.searchParams.get("lineageId") ?? undefined,
      });
    });
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const agentDetailMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/analysis\/agents\/(\d+)$/);
  if (req.method === "GET" && agentDetailMatch) {
    const runId = readRunId(agentDetailMatch);
    const spawnerId = Number(agentDetailMatch[2]);
    const result = withHeadlessRepository("headless.analysis.agentDetail", (repository) =>
      repository.getAgentDetail(runId, spawnerId, {
        tradeLimit: url.searchParams.get("tradeLimit") ?? undefined,
        tradeOffset: url.searchParams.get("tradeOffset") ?? undefined,
      }),
    );
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const lineageMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/analysis\/lineages$/);
  if (req.method === "GET" && lineageMatch) {
    const runId = readRunId(lineageMatch);
    const result = withHeadlessRepository("headless.analysis.lineages", (repository) => {
      if (!repository.getRun(runId)) return null;
      return repository.listLineageLeaderboard(runId, {
        sortKey: url.searchParams.get("sortKey") ?? undefined,
        sortDirection: url.searchParams.get("sortDirection") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined,
      });
    });
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const eventsMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/analysis\/events$/);
  if (req.method === "GET" && eventsMatch) {
    const runId = readRunId(eventsMatch);
    const result = withHeadlessRepository("headless.analysis.events", (repository) => {
      if (!repository.getRun(runId)) return null;
      return repository.listEventTimeline(runId, { interval: url.searchParams.get("interval") ?? undefined });
    });
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, rows: result });
    return true;
  }

  const tradesMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/analysis\/trades$/);
  if (req.method === "GET" && tradesMatch) {
    const runId = readRunId(tradesMatch);
    const result = withHeadlessRepository("headless.analysis.trades", (repository) => {
      if (!repository.getRun(runId)) return null;
      return repository.getTradeBreakdown(runId);
    });
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const runMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const result = getSineHeadlessJob(readRunId(runMatch));
    if (!result) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const cancelMatch = url.pathname.match(/^\/api\/sine\/headless\/runs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    const job = cancelSineHeadlessJob(readRunId(cancelMatch));
    if (!job) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  return false;
}

function readRunId(match) {
  return decodeURIComponent(match[1]);
}

function withHeadlessRepository(label, read) {
  const repository = createSineHeadlessRepository();
  try {
    return timeBenchmarkQuery(label, () => read(repository));
  } finally {
    repository.close();
  }
}
