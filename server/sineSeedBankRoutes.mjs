import { createSineSeedBankCandidateService, listCandidateSourceRuns } from "./sineSeedBankCandidates.mjs";
import { createSineSeedBankRepository } from "./sineSeedBankRepository.mjs";

export async function routeSineSeedBankRequest({
  req,
  res,
  url,
  readBody,
  sendJson,
  notFound,
  repository,
  candidateService,
  repositoryFactory = createSineSeedBankRepository,
  candidateServiceFactory = createSineSeedBankCandidateService,
}) {
  const route = seedBankRoute(url.pathname);
  if (!route) {
    return false;
  }
  let seedBankRepository = repository ?? null;
  let candidates = candidateService ?? null;
  const getRepository = () => {
    seedBankRepository ??= repositoryFactory();
    return seedBankRepository;
  };
  const getCandidates = () => {
    candidates ??= candidateServiceFactory({ seedBankRepository: getRepository() });
    return candidates;
  };

  if (req.method === "GET" && route.kind === "banks") {
    sendJson(res, 200, { ok: true, seedBanks: getRepository().listSeedBanks() });
    return true;
  }

  if (req.method === "POST" && route.kind === "banks") {
    const payload = await readObjectBody(req, readBody);
    if (!payload.ok) {
      sendJson(res, 400, { error: payload.error });
      return true;
    }
    const label = readOptionalText(payload.label);
    if (!label) {
      sendJson(res, 400, { error: "Missing seed bank label" });
      return true;
    }
    try {
      const bank = getRepository().createSeedBank({ id: readOptionalText(payload.id), label, description: readOptionalText(payload.description) ?? "" });
      sendJson(res, 200, { ok: true, seedBank: bank });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, errorStatus(message), { error: duplicateSeedBankMessage(message) ?? message });
    }
    return true;
  }

  if (req.method === "PATCH" && route.kind === "bank") {
    const bankId = route.bankId;
    const existing = getRepository().getSeedBank(bankId);
    if (!existing) {
      notFound(res);
      return true;
    }
    const payload = await readObjectBody(req, readBody);
    if (!payload.ok) {
      sendJson(res, 400, { error: payload.error });
      return true;
    }
    const update = {};
    if (Object.hasOwn(payload, "label")) {
      const label = readOptionalText(payload.label);
      if (!label) {
        sendJson(res, 400, { error: "Missing seed bank label" });
        return true;
      }
      update.label = label;
    }
    if (Object.hasOwn(payload, "description")) update.description = readOptionalText(payload.description) ?? "";
    const seedBank = getRepository().updateSeedBank(bankId, update);
    sendJson(res, 200, { ok: true, seedBank });
    return true;
  }

  if (req.method === "GET" && route.kind === "entries") {
    const bankId = route.bankId;
    if (!getRepository().getSeedBank(bankId)) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, entries: getRepository().listEntrySummaries(bankId) });
    return true;
  }

  if (req.method === "GET" && route.kind === "entry") {
    const entry = getRepository().getEntry(route.entryId);
    if (!entry) {
      notFound(res);
      return true;
    }
    sendJson(res, 200, { ok: true, entry });
    return true;
  }

  if (req.method === "GET" && route.kind === "candidateRuns") {
    const query = readCandidateRunsQuery(url.searchParams);
    if (!query.ok) {
      sendJson(res, 400, { error: query.error });
      return true;
    }
    sendJson(res, 200, { ok: true, ...listCandidateSourceRuns(undefined, query.value) });
    return true;
  }

  if (req.method === "GET" && route.kind === "candidates") {
    const filter = readCandidateQuery(url.searchParams);
    if (!filter.ok) {
      sendJson(res, 400, { error: filter.error });
      return true;
    }
    sendJson(res, 200, { ok: true, ...getCandidates().listCandidates(filter.value) });
    return true;
  }

  if (req.method === "POST" && route.kind === "admissions") {
    const payload = await readObjectBody(req, readBody);
    if (!payload.ok) {
      sendJson(res, 400, { error: payload.error });
      return true;
    }
    const validation = readAdmissionRequest(payload);
    if (!validation.ok) {
      sendJson(res, 400, { error: validation.error });
      return true;
    }
    try {
      const result = getCandidates().admitCandidate(validation.value);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, errorStatus(message), { error: message });
    }
    return true;
  }

  if (req.method === "POST" && route.kind === "batchAdmissions") {
    const payload = await readObjectBody(req, readBody);
    if (!payload.ok) {
      sendJson(res, 400, { error: payload.error });
      return true;
    }
    const validation = readBatchAdmissionRequest(payload);
    if (!validation.ok) {
      sendJson(res, 400, { error: validation.error });
      return true;
    }
    try {
      const result = getCandidates().admitCandidates(validation.value);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, errorStatus(message), { error: message });
    }
    return true;
  }

  return false;
}

function seedBankRoute(pathname) {
  if (pathname === "/api/sine/seed-banks") return { kind: "banks" };
  if (pathname === "/api/sine/seed-bank/candidate-runs") return { kind: "candidateRuns" };
  if (pathname === "/api/sine/seed-bank/candidates") return { kind: "candidates" };
  if (pathname === "/api/sine/seed-bank/admissions/batch") return { kind: "batchAdmissions" };
  if (pathname === "/api/sine/seed-bank/admissions") return { kind: "admissions" };
  const bankMatch = pathname.match(/^\/api\/sine\/seed-banks\/([^/]+)$/);
  if (bankMatch) return { kind: "bank", bankId: readPathPart(bankMatch[1]) };
  const entriesMatch = pathname.match(/^\/api\/sine\/seed-banks\/([^/]+)\/entries$/);
  if (entriesMatch) return { kind: "entries", bankId: readPathPart(entriesMatch[1]) };
  const entryMatch = pathname.match(/^\/api\/sine\/seed-bank\/entries\/([^/]+)$/);
  if (entryMatch) return { kind: "entry", entryId: readPathPart(entryMatch[1]) };
  return null;
}

async function readObjectBody(req, readBody) {
  let payload;
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: "Malformed JSON body" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  return Object.assign(payload, { ok: true });
}

function readAdmissionRequest(payload) {
  const bankId = readOptionalText(payload.bankId);
  if (!bankId) return { ok: false, error: "Missing seed bank id" };
  const sourceRunId = readOptionalText(payload.sourceRunId);
  if (!sourceRunId) return { ok: false, error: "Missing source run id" };
  const sourceSpawnerId = Number(payload.sourceSpawnerId);
  if (!Number.isInteger(sourceSpawnerId) || sourceSpawnerId < 0) return { ok: false, error: "Missing source spawner id" };
  const filters = payload.filters === undefined ? {} : payload.filters;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { ok: false, error: "Invalid filters" };
  const filterValidation = validateCandidateNumbers(filters);
  if (!filterValidation.ok) return filterValidation;
  return { ok: true, value: { bankId, sourceRunId, sourceSpawnerId, filters } };
}

function readBatchAdmissionRequest(payload) {
  const bankId = readOptionalText(payload.bankId);
  if (!bankId) return { ok: false, error: "Missing seed bank id" };
  const runIds = Array.isArray(payload.runIds) ? payload.runIds.map(readOptionalText).filter(Boolean) : [];
  if (runIds.length === 0) return { ok: false, error: "Missing source run ids" };
  const filters = payload.filters === undefined ? {} : payload.filters;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return { ok: false, error: "Invalid filters" };
  const filterValidation = validateCandidateNumbers(filters);
  if (!filterValidation.ok) return filterValidation;
  return { ok: true, value: { bankId, runIds: [...new Set(runIds)], filters } };
}

function readCandidateQuery(searchParams) {
  const runIds = readRunIds(searchParams);
  const filter = {
    runIds,
    bankId: searchParams.get("bankId") ?? undefined,
    minResolvedTrades: searchParams.get("minResolvedTrades") ?? undefined,
    minChildren: searchParams.get("minChildren") ?? undefined,
    minAgePercentile: searchParams.get("minAgePercentile") ?? undefined,
    minSharpe: searchParams.get("minSharpe") ?? undefined,
    minSortino: searchParams.get("minSortino") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  };
  const validation = validateCandidateNumbers(filter);
  return validation.ok ? { ok: true, value: filter } : validation;
}

function readCandidateRunsQuery(searchParams) {
  const query = {
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  };
  for (const key of ["limit", "offset"]) {
    if (!validOptionalInteger(query[key], key === "limit" ? 1 : 0)) return { ok: false, error: `Invalid ${key}` };
  }
  return { ok: true, value: query };
}

function validateCandidateNumbers(input) {
  const integerKeys = ["minResolvedTrades", "minChildren", "limit", "offset"];
  for (const key of integerKeys) {
    if (!validOptionalInteger(input[key], key === "limit" ? 1 : 0)) return { ok: false, error: `Invalid ${key}` };
  }
  for (const key of ["minAgePercentile", "minSharpe", "minSortino"]) {
    if (!validOptionalNumber(input[key])) return { ok: false, error: `Invalid ${key}` };
  }
  return { ok: true };
}

function validOptionalInteger(value, min) {
  if (value === undefined || value === null || value === "") return true;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= min;
}

function validOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return true;
  return Number.isFinite(Number(value));
}

function readRunIds(searchParams) {
  const repeated = searchParams.getAll("runId").flatMap((runId) => runId.split(","));
  const plural = searchParams.getAll("runIds").flatMap((runId) => runId.split(","));
  return [...new Set([...repeated, ...plural].map((runId) => runId.trim()).filter(Boolean))];
}

function readOptionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPathPart(value) {
  return decodeURIComponent(value);
}

function errorStatus(message) {
  if (duplicateSeedBankMessage(message)) return 409;
  if (message.startsWith("Missing ")) return 400;
  return message.toLowerCase().includes("not found") ? 404 : 400;
}

function duplicateSeedBankMessage(message) {
  return message.includes("UNIQUE constraint failed: seed_banks.id") ? "Seed bank already exists" : null;
}
