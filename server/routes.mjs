import { sanitizeParameters } from "../src/sim/parameters.ts";
import {
  createServerBatchJob,
  getBatchJob,
  hasActiveBatchJob,
  hasActiveJobForExperiment,
  isActiveStatus,
  listBatchJobs,
  requestBatchJobCancel,
  runServerBatchJob,
} from "./batchJobs.mjs";
import {
  deleteBatchExperiment,
  getBatchExperimentStatus,
  getBatchExperimentSummary,
  listBatchExperiments,
  saveBatchSummary,
} from "./batchRepository.mjs";
import { saveEvents, getLatestWorld, saveSnapshot } from "./worldRepository.mjs";
import {
  readLimit,
  sanitizeBatchOptions,
  validateBatchParameters,
  validateBatchSummary,
} from "./validation.mjs";

export async function routeRequest(req, res) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/world/latest") {
      sendJson(res, 200, getLatestWorld(url.searchParams.get("worldId") ?? "local-v0"));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/world/snapshot") {
      const payload = JSON.parse(await readBody(req));
      const worldId = String(payload.worldId ?? "local-v0");
      const snapshot = payload.snapshot;
      if (!snapshot || typeof snapshot.tick !== "number") {
        sendJson(res, 400, { error: "Missing snapshot.tick" });
        return;
      }
      saveSnapshot(worldId, snapshot);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/world/events") {
      const payload = JSON.parse(await readBody(req));
      const worldId = String(payload.worldId ?? "local-v0");
      const births = Array.isArray(payload.births) ? payload.births : [];
      const deaths = Array.isArray(payload.deaths) ? payload.deaths : [];
      saveEvents(worldId, births, deaths);
      sendJson(res, 200, { ok: true, births: births.length, deaths: deaths.length });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/batch/experiments") {
      sendJson(res, 200, { experiments: listBatchExperiments(readLimit(url.searchParams.get("limit"))) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/batch/experiments") {
      const payload = JSON.parse(await readBody(req));
      const summary = payload.summary;
      const status = payload.status === "cancelled" ? "cancelled" : "complete";
      const label = readLabel(payload.label);
      const validationError = validateBatchSummary(summary);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const experimentId = saveBatchSummary(summary, status, label);
      sendJson(res, 200, {
        ok: true,
        experimentId,
        runs: summary.runs.length,
        lineages: summary.runs.reduce((sum, run) => sum + run.survivingLineages.length, 0),
      });
      return;
    }

    const experimentMatch = url.pathname.match(/^\/api\/batch\/experiments\/(\d+)$/);
    if (req.method === "GET" && experimentMatch) {
      const summary = getBatchExperimentSummary(Number(experimentMatch[1]));
      if (!summary) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { summary });
      return;
    }

    if (req.method === "DELETE" && experimentMatch) {
      const experimentId = Number(experimentMatch[1]);
      const experiment = getBatchExperimentStatus(experimentId);
      if (!experiment) {
        notFound(res);
        return;
      }
      if (hasActiveJobForExperiment(experimentId) || isActiveStatus(experiment.status)) {
        sendJson(res, 409, { error: "Cancel or wait for this batch before deleting it" });
        return;
      }
      const result = deleteBatchExperiment(experimentId);
      sendJson(res, result.changes === 0 ? 404 : 200, result.changes === 0 ? { error: "Not found" } : { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/batch/jobs") {
      sendJson(res, 200, { jobs: listBatchJobs(readLimit(url.searchParams.get("limit"))) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/batch/jobs") {
      if (hasActiveBatchJob()) {
        sendJson(res, 409, { error: "Another batch job is already running" });
        return;
      }
      const payload = JSON.parse(await readBody(req));
      const optionsResult = sanitizeBatchOptions(payload.options);
      if (!optionsResult.ok) {
        sendJson(res, 400, { error: optionsResult.error });
        return;
      }
      const parameters = sanitizeParameters(payload.parameters);
      const parameterError = validateBatchParameters(parameters);
      if (parameterError) {
        sendJson(res, 400, { error: parameterError });
        return;
      }

      const { jobId, experimentId } = createServerBatchJob(optionsResult.options, parameters, readLabel(payload.label));
      void runServerBatchJob(jobId);
      sendJson(res, 200, { ok: true, jobId, experimentId });
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/batch\/jobs\/(\d+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = getBatchJob(Number(jobMatch[1]));
      if (!job) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { job });
      return;
    }

    const jobCancelMatch = url.pathname.match(/^\/api\/batch\/jobs\/(\d+)\/cancel$/);
    if (req.method === "POST" && jobCancelMatch) {
      const job = requestBatchJobCancel(Number(jobCancelMatch[1]));
      if (!job) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 250_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}
