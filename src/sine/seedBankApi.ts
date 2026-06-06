import { getSineJson, patchSineJson, postSineJson } from "./sineApi";
import type { SineSeedBankEntry, SineSeedBankEntrySummary, SineSeedBankRecord } from "./seedBankTypes";

export type SineSeedBankCandidateSourceRun = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  seed: number | null;
  targetTicks: number | null;
  minimumResolvedTrades: number | null;
  reconstructableAgents: number;
  reconstructionSnapshots: number;
};

export type SineSeedBankCandidateSourceRunResponse = {
  ok: true;
  runs: SineSeedBankCandidateSourceRun[];
  total: number;
  limit: number;
  offset: number;
  search: string;
};

export type SineSeedBankCandidateFilter = {
  runIds?: string[];
  bankId?: string;
  minResolvedTrades?: number;
  minChildren?: number;
  minAgePercentile?: number;
  minSharpe?: number;
  minSortino?: number;
  limit?: number;
  offset?: number;
};

export type SineSeedBankCandidate = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  parentSpawnerId: number | null;
  birthTick: number;
  deathTick: number | null;
  lifespanTicks: number | null;
  children: number;
  resolvedTrades: number;
  hitRate: number;
  averagePayoff: number;
  cumulativePayoff: number;
  payoffStdDev: number;
  sharpe: number | null;
  sortino: number | null;
  downsideVolatility: number;
  ageExposureTicks: number;
  ageExposurePercentile: number;
  reconstructionSnapshotCount: number;
  latestReconstructionSnapshotTick: number | null;
  reconstructionSnapshotReasons: string[];
  alreadyAdmitted: boolean;
};

export type SineSeedBankCandidateResponse = {
  ok: true;
  rows: SineSeedBankCandidate[];
  total: number;
  admittableTotal: number;
  limit: number;
  offset: number;
  filter: Record<string, unknown>;
};

export type SineSeedBankAdmissionRequest = {
  bankId: string;
  sourceRunId: string;
  sourceSpawnerId: number;
  filters?: Omit<SineSeedBankCandidateFilter, "runIds" | "bankId" | "limit" | "offset">;
};

export type SineSeedBankBatchAdmissionRequest = {
  bankId: string;
  runIds: string[];
  filters?: Omit<SineSeedBankCandidateFilter, "runIds" | "bankId" | "limit" | "offset">;
};

export type SineSeedBankBatchAdmissionResponse = {
  ok: true;
  matched: number;
  alreadyAdmitted: number;
  attempted: number;
  inserted: number;
  failed: number;
  errors: { runId: string; spawnerId: number; error: string }[];
};

export function listSineSeedBanks() {
  return getSineJson<{ ok: true; seedBanks: SineSeedBankRecord[] }>("/api/sine/seed-banks");
}

export function createSineSeedBank(input: { id?: string; label: string; description?: string }) {
  return postSineJson<{ ok: true; seedBank: SineSeedBankRecord }>("/api/sine/seed-banks", input);
}

export function updateSineSeedBank(id: string, input: { label?: string; description?: string }) {
  return patchSineJson<{ ok: true; seedBank: SineSeedBankRecord }>(`/api/sine/seed-banks/${encodeURIComponent(id)}`, input);
}

export function listSineSeedBankEntries(bankId: string) {
  return getSineJson<{ ok: true; entries: SineSeedBankEntrySummary[] }>(`/api/sine/seed-banks/${encodeURIComponent(bankId)}/entries`);
}

export function getSineSeedBankEntry(entryId: string) {
  return getSineJson<{ ok: true; entry: SineSeedBankEntry }>(`/api/sine/seed-bank/entries/${encodeURIComponent(entryId)}`);
}

export function listSineSeedBankCandidateRuns(input: number | { limit?: number; offset?: number; search?: string } = 50) {
  const params = new URLSearchParams();
  const options = typeof input === "number" ? { limit: input } : input;
  appendOptional(params, "limit", options.limit);
  appendOptional(params, "offset", options.offset);
  appendOptional(params, "search", options.search);
  return getSineJson<SineSeedBankCandidateSourceRunResponse>("/api/sine/seed-bank/candidate-runs", params);
}

export function listSineSeedBankCandidates(filter: SineSeedBankCandidateFilter) {
  return getSineJson<SineSeedBankCandidateResponse>("/api/sine/seed-bank/candidates", candidateQueryParams(filter));
}

export function admitSineSeedBankCandidate(input: SineSeedBankAdmissionRequest) {
  return postSineJson<{ ok: true; inserted: boolean; entry: SineSeedBankEntry }>("/api/sine/seed-bank/admissions", input);
}

export function admitSineSeedBankCandidates(input: SineSeedBankBatchAdmissionRequest) {
  return postSineJson<SineSeedBankBatchAdmissionResponse>("/api/sine/seed-bank/admissions/batch", input);
}

function candidateQueryParams(filter: SineSeedBankCandidateFilter) {
  const params = new URLSearchParams();
  if (filter.runIds?.length) params.set("runIds", filter.runIds.join(","));
  appendOptional(params, "bankId", filter.bankId);
  appendOptional(params, "minResolvedTrades", filter.minResolvedTrades);
  appendOptional(params, "minChildren", filter.minChildren);
  appendOptional(params, "minAgePercentile", filter.minAgePercentile);
  appendOptional(params, "minSharpe", filter.minSharpe);
  appendOptional(params, "minSortino", filter.minSortino);
  appendOptional(params, "limit", filter.limit);
  appendOptional(params, "offset", filter.offset);
  return params;
}

function appendOptional(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== "") params.set(key, String(value));
}
