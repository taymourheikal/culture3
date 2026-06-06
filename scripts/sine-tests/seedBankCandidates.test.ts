import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
// @ts-expect-error The server module is runtime ESM loaded by tsx for integration coverage.
import { createSineSeedBankCandidateService, listCandidateSourceRuns } from "../../server/sineSeedBankCandidates.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { createSineSeedBankRepository } from "../../server/sineSeedBankRepository.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession } from "../../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";

function testSeedBankCandidatesUseHeadlessFactsAndFilters() {
  const runId = uniqueTestSessionId("test-sine-seed-candidates");
  const labRunId = uniqueTestSessionId("test-sine-seed-candidates-lab");
  try {
    seedCandidateRun(runId, "headless");
    seedCandidateRun(labRunId, "lab");
    const repository = tempSeedBankRepository();
    try {
      const service = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: repository });
      const sourceRuns = service.listCandidateSourceRuns({ limit: 20 }).runs.filter((run: any) => run.id === runId || run.id === labRunId);
      assert.deepEqual(sourceRuns.map((run: any) => run.id), [runId]);
      const all = service.listCandidates({ runIds: [runId, labRunId], limit: 10 });
      assert.equal(all.total, 3);
      assert.equal(all.admittableTotal, 3);
      assert.deepEqual(new Set(all.rows.map((row: any) => row.runId)), new Set([runId]));

      const alpha = all.rows.find((row: any) => row.spawnerId === 1);
      assert.ok(alpha);
      assert.equal(alpha.children, 2);
      assert.equal(alpha.resolvedTrades, 3);
      assert.equal(alpha.hitRate, 2 / 3);
      assert.equal(alpha.averagePayoff, 2 / 3);
      assert.equal(alpha.reconstructionSnapshotCount, 4);
      assert.equal(alpha.latestReconstructionSnapshotTick, 1000);
      assert.deepEqual(alpha.reconstructionSnapshotReasons, ["birth", "final", "reproduction", "trade_interval"]);
      assert.equal(alpha.ageExposureTicks, 1000);
      assert.equal(alpha.ageExposurePercentile, 100);
      assert.ok(alpha.sharpe > 0.43 && alpha.sharpe < 0.44);
      assert.ok(alpha.sortino > 1.15 && alpha.sortino < 1.16);

      const beta = all.rows.find((row: any) => row.spawnerId === 2);
      assert.ok(beta);
      assert.deepEqual(beta.reconstructionSnapshotReasons, ["birth", "death"]);

      const filtered = service.listCandidates({
        runIds: [runId],
        minResolvedTrades: 3,
        minChildren: 1,
        minAgePercentile: 50,
        minSharpe: 0.4,
        minSortino: 1,
        limit: 10,
      });
      assert.deepEqual(filtered.rows.map((row: any) => row.spawnerId), [1]);

      const impossibleChildren = service.listCandidates({ runIds: [runId], minChildren: 3 });
      assert.equal(impossibleChildren.total, 0);

      const nullSharpeExcluded = service.listCandidates({ runIds: [runId], minResolvedTrades: 2, minSharpe: 0.1 });
      assert.deepEqual(nullSharpeExcluded.rows.map((row: any) => row.spawnerId), [1]);
    } finally {
      repository.close();
      rmSync(repository.__tempDir, { recursive: true, force: true });
    }
  } finally {
    deleteSineSession(runId);
    deleteSineSession(labRunId);
  }
}

function testSeedBankCandidateSourceRunsPageSearchAndExcludeEmptyRuns() {
  const firstRunId = uniqueTestSessionId("test-sine-seed-source-page-a");
  const secondRunId = uniqueTestSessionId("test-sine-seed-source-page-b");
  const emptyRunId = uniqueTestSessionId("test-sine-seed-source-page-empty");
  try {
    seedCandidateRun(firstRunId, "headless");
    seedCandidateRun(secondRunId, "headless");
    insertSession(emptyRunId, "headless", 100);
    insertBirth(emptyRunId, 99, 1, 0, null, 0);

    const pageOne = listCandidateSourceRuns(sineDb, { limit: 1, offset: 0, search: "test-sine-seed-source-page" });
    const pageTwo = listCandidateSourceRuns(sineDb, { limit: 1, offset: 1, search: "test-sine-seed-source-page" });
    const ids = [...pageOne.runs, ...pageTwo.runs].map((run: any) => run.id);
    assert.equal(pageOne.total, 2);
    assert.equal(pageOne.limit, 1);
    assert.equal(pageTwo.offset, 1);
    assert.deepEqual(new Set(ids), new Set([firstRunId, secondRunId]));
    assert.equal(ids.includes(emptyRunId), false);
  } finally {
    deleteSineSession(firstRunId);
    deleteSineSession(secondRunId);
    deleteSineSession(emptyRunId);
  }
}

function testSeedBankCandidatesReturnEmptyForMissingSnapshots() {
  const runId = uniqueTestSessionId("test-sine-seed-no-snapshots");
  try {
    insertSession(runId, "headless", 100);
    insertBirth(runId, 10, 1, 0, null, 0);
    const repository = tempSeedBankRepository();
    try {
      const service = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: repository });
      const result = service.listCandidates({ runIds: [runId], limit: 10 });
      assert.equal(result.total, 0);
      assert.deepEqual(result.rows, []);
    } finally {
      repository.close();
      rmSync(repository.__tempDir, { recursive: true, force: true });
    }
  } finally {
    deleteSineSession(runId);
  }
}

function testSeedBankCandidateAdmissionFreezesAllSnapshotsAndDuplicates() {
  const runId = uniqueTestSessionId("test-sine-seed-admit");
  try {
    seedCandidateRun(runId, "headless");
    const repository = tempSeedBankRepository();
    try {
      repository.createSeedBank({ id: "bank-candidates", label: "Candidates" });
      const service = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: repository });
      const first = service.admitCandidate({
        bankId: "bank-candidates",
        sourceRunId: runId,
        sourceSpawnerId: 1,
        filters: { minResolvedTrades: 3, minChildren: 1, minAgePercentile: 50, minSharpe: 0.4, minSortino: 1 },
      });
      assert.equal(first.inserted, true);
      assert.equal(first.entry.source.runId, runId);
      assert.equal(first.entry.source.spawnerId, 1);
      assert.equal(first.entry.reconstructionSnapshotCount, 4);
      assert.deepEqual(first.entry.snapshots.map((snapshot: any) => snapshot.sourceReason), ["birth", "reproduction", "trade_interval", "final"]);
      assert.deepEqual(first.entry.snapshots.map((snapshot: any) => snapshot.sourceTick), [0, 250, 500, 1000]);
      assert.deepEqual(first.entry.snapshots[0]?.genome, genomeFor(1, "birth"));
      assert.deepEqual(first.entry.snapshots[3]?.hiddenState, { "1": 1000 });
      assert.deepEqual(first.entry.snapshots[3]?.learnedState, { learnedConnectionDeltas: { "1:final": 1000 } });
      assert.equal(first.entry.admission.metrics.children, 2);
      assert.equal(first.entry.admission.metrics.resolvedTrades, 3);
      assert.equal(first.entry.admission.filters.minChildren, 1);

      const duplicate = service.admitCandidate({ bankId: "bank-candidates", sourceRunId: runId, sourceSpawnerId: 1 });
      assert.equal(duplicate.inserted, false);
      assert.equal(duplicate.entry.id, first.entry.id);

      const withBankContext = service.listCandidates({ runIds: [runId], bankId: "bank-candidates", limit: 10 });
      assert.equal(withBankContext.total, 3);
      assert.equal(withBankContext.admittableTotal, 2);
      assert.equal(withBankContext.rows.find((row: any) => row.spawnerId === 1)?.alreadyAdmitted, true);
      assert.equal(withBankContext.rows.find((row: any) => row.spawnerId === 2)?.alreadyAdmitted, false);

      deleteSineSession(runId);
      const frozen = repository.getEntry(first.entry.id);
      assert.equal(frozen.snapshots.length, 4);
      assert.deepEqual(frozen.snapshots[3]?.genome, genomeFor(1, "final"));
    } finally {
      repository.close();
      rmSync(repository.__tempDir, { recursive: true, force: true });
    }
  } finally {
    deleteSineSession(runId);
  }
}

function testSeedBankCandidateBatchAdmissionMatchesRepeatedSinglesAndSkipsDuplicates() {
  const runId = uniqueTestSessionId("test-sine-seed-batch-admit");
  try {
    seedCandidateRun(runId, "headless");

    const batchRepository = tempSeedBankRepository();
    const singleRepository = tempSeedBankRepository();
    try {
      batchRepository.createSeedBank({ id: "bank-batch", label: "Batch" });
      singleRepository.createSeedBank({ id: "bank-single", label: "Single" });
      const batchService = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: batchRepository });
      const singleService = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: singleRepository });
      const filters = { minResolvedTrades: 2 };

      const batch = batchService.admitCandidates({ bankId: "bank-batch", runIds: [runId], filters });
      assert.deepEqual(
        {
          matched: batch.matched,
          alreadyAdmitted: batch.alreadyAdmitted,
          attempted: batch.attempted,
          inserted: batch.inserted,
          failed: batch.failed,
        },
        { matched: 2, alreadyAdmitted: 0, attempted: 2, inserted: 2, failed: 0 },
      );
      assert.deepEqual(batch.errors, []);

      const singleCandidates = singleService.listCandidates({ runIds: [runId], ...filters, limit: 1 });
      assert.equal(singleCandidates.total, 2);
      assert.equal(singleCandidates.rows.length, 1);
      for (const spawnerId of [1, 2]) {
        const result = singleService.admitCandidate({ bankId: "bank-single", sourceRunId: runId, sourceSpawnerId: spawnerId, filters });
        assert.equal(result.inserted, true);
      }

      const entrySummary = (entry: any) => ({ spawnerId: entry.source.spawnerId, snapshots: entry.reconstructionSnapshotCount });
      const bySpawnerId = (left: any, right: any) => left.spawnerId - right.spawnerId;
      const batchEntries = batchRepository.listEntries("bank-batch").map(entrySummary).sort(bySpawnerId);
      const singleEntries = singleRepository.listEntries("bank-single").map(entrySummary).sort(bySpawnerId);
      assert.deepEqual(batchEntries, singleEntries);

      const rerun = batchService.admitCandidates({ bankId: "bank-batch", runIds: [runId], filters });
      assert.deepEqual(
        {
          matched: rerun.matched,
          alreadyAdmitted: rerun.alreadyAdmitted,
          attempted: rerun.attempted,
          inserted: rerun.inserted,
          failed: rerun.failed,
        },
        { matched: 2, alreadyAdmitted: 2, attempted: 0, inserted: 0, failed: 0 },
      );
      const afterRerun = batchService.listCandidates({ runIds: [runId], bankId: "bank-batch", ...filters, limit: 1 });
      assert.equal(afterRerun.total, 2);
      assert.equal(afterRerun.admittableTotal, 0);
      assert.equal(afterRerun.rows.length, 1);
    } finally {
      batchRepository.close();
      singleRepository.close();
      rmSync(batchRepository.__tempDir, { recursive: true, force: true });
      rmSync(singleRepository.__tempDir, { recursive: true, force: true });
    }
  } finally {
    deleteSineSession(runId);
  }
}

function testSeedBankCandidateAdmissionHandlesBirthOnlyAndMissingSnapshots() {
  const runId = uniqueTestSessionId("test-sine-seed-birth-only");
  const missingRunId = uniqueTestSessionId("test-sine-seed-missing-admit");
  try {
    seedCandidateRun(runId, "headless");
    insertSession(missingRunId, "headless", 100);
    insertBirth(missingRunId, 20, 1, 0, null, 0);
    const repository = tempSeedBankRepository();
    try {
      repository.createSeedBank({ id: "bank-edge", label: "Edge" });
      const service = createSineSeedBankCandidateService({ runDb: sineDb, seedBankRepository: repository });
      const birthOnly = service.admitCandidate({ bankId: "bank-edge", sourceRunId: runId, sourceSpawnerId: 3 });
      assert.equal(birthOnly.inserted, true);
      assert.equal(birthOnly.entry.reconstructionSnapshotCount, 1);
      assert.deepEqual(birthOnly.entry.snapshots.map((snapshot: any) => snapshot.sourceReason), ["birth"]);

      assert.throws(
        () => service.admitCandidate({ bankId: "bank-edge", sourceRunId: missingRunId, sourceSpawnerId: 20 }),
        /Reconstructable seed-bank candidate not found/,
      );
      assert.equal(repository.listEntries("bank-edge").length, 1);
    } finally {
      repository.close();
      rmSync(repository.__tempDir, { recursive: true, force: true });
    }
  } finally {
    deleteSineSession(runId);
    deleteSineSession(missingRunId);
  }
}

export function seedCandidateRun(sessionId: string, runMode: "headless" | "lab") {
  insertSession(sessionId, runMode, 1000);
  insertBirth(sessionId, 1, 1, 0, null, 0);
  insertBirth(sessionId, 2, 1, 1, 1, 100);
  insertBirth(sessionId, 3, 1, 1, 1, 100);
  insertDeath(sessionId, 2, 600);
  insertFood(sessionId, 1, 1, 1, 100, 120, 1);
  insertFood(sessionId, 2, 1, 1, 200, 220, 2);
  insertFood(sessionId, 3, 1, 1, 300, 320, -1);
  insertFood(sessionId, 4, 2, 1, 400, 420, 1);
  insertFood(sessionId, 5, 2, 1, 500, 520, 1);
  insertSnapshot(sessionId, 1, 1, 0, "birth");
  insertSnapshot(sessionId, 1, 1, 250, "reproduction");
  insertSnapshot(sessionId, 1, 1, 500, "trade_interval");
  insertSnapshot(sessionId, 1, 1, 1000, "final");
  insertSnapshot(sessionId, 2, 1, 100, "birth");
  insertSnapshot(sessionId, 2, 1, 600, "death");
  insertSnapshot(sessionId, 3, 1, 100, "birth");
}

export function insertSession(sessionId: string, runMode: "headless" | "lab", tick: number) {
  const now = new Date().toISOString();
  sineDb.prepare(`
    INSERT INTO sine_sessions (
      id, created_at, updated_at, status, settings_json, spawner_config_json, run_mode, seed, target_ticks, completed_at, termination_reason
    )
    VALUES (?, ?, ?, 'completed', ?, ?, ?, 101, ?, ?, 'target')
  `).run(sessionId, now, now, JSON.stringify({ source: "generated" }), JSON.stringify(DEFAULT_SPAWNER_CONFIG), runMode, tick, now);
}

export function insertBirth(sessionId: string, spawnerId: number, lineageId: number, generation: number, parentSpawnerId: number | null, tick: number) {
  sineDb.prepare(`
    INSERT INTO sine_spawner_births (
      session_id, spawner_id, parent_spawner_id, lineage_id, generation, birth_tick, birth_time, spawner_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, spawnerId, parentSpawnerId, lineageId, generation, tick, tick, JSON.stringify({ id: spawnerId, lineageId, generation, parentSpawnerId, birthTick: tick }));
}

function insertDeath(sessionId: string, spawnerId: number, tick: number) {
  sineDb.prepare(`
    INSERT INTO sine_spawner_deaths (
      session_id, spawner_id, lineage_id, generation, death_tick, death_time, spawner_json, death_cause
    )
    VALUES (?, ?, 1, 1, ?, ?, ?, 'low_energy')
  `).run(sessionId, spawnerId, tick, tick, JSON.stringify({ id: spawnerId, lineageId: 1, generation: 1 }));
}

function insertFood(sessionId: string, foodId: number, spawnerId: number, lineageId: number, spawnTick: number, resolveTick: number, payoff: number) {
  const food = {
    id: foodId,
    creatorSpawnerId: spawnerId,
    creatorLineageId: lineageId,
    spawnTick,
    resolveTick,
    direction: "long",
    strength: 1,
    horizonTicks: resolveTick - spawnTick,
    entrySignal: 0,
    exitSignal: payoff,
    entryPayoffScale: 1,
    status: payoff > 0 ? "win" : "loss",
    payoff,
  };
  sineDb.prepare(`
    INSERT INTO sine_food_events (
      session_id, food_id, event_kind, spawner_id, lineage_id, tick, time, food_json
    )
    VALUES (?, ?, 'resolve', ?, ?, ?, ?, ?)
  `).run(sessionId, foodId, spawnerId, lineageId, resolveTick, resolveTick, JSON.stringify(food));
}

function insertSnapshot(sessionId: string, spawnerId: number, lineageId: number, tick: number, reason: string) {
  sineDb.prepare(`
    INSERT INTO sine_headless_reconstruction_snapshots (
      session_id,
      spawner_id,
      lineage_id,
      generation,
      parent_spawner_id,
      tick,
      reason,
      schema_version,
      genome_json,
      hidden_state_json,
      learned_state_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    sessionId,
    spawnerId,
    lineageId,
    spawnerId === 1 ? 0 : 1,
    spawnerId === 1 ? null : 1,
    tick,
    reason,
    JSON.stringify(genomeFor(spawnerId, reason)),
    JSON.stringify({ [spawnerId]: tick }),
    JSON.stringify({ learnedConnectionDeltas: { [`${spawnerId}:${reason}`]: tick } }),
    new Date().toISOString(),
  );
}

function genomeFor(spawnerId: number, reason: string) {
  return { units: [{ unitId: spawnerId, label: reason }], connections: [{ innovationId: spawnerId * 100 + reason.length }] };
}

function tempSeedBankRepository() {
  const dir = mkdtempSync(join(tmpdir(), "sine-seed-bank-candidates-"));
  const repository = createSineSeedBankRepository({ dbPath: join(dir, "seed-bank.sqlite") });
  return Object.assign(repository, { __tempDir: dir });
}

export const tests: SineTest[] = [
  { name: "Seed Bank Candidates Use Headless Facts And Filters", run: testSeedBankCandidatesUseHeadlessFactsAndFilters },
  { name: "Seed Bank Candidates Return Empty For Missing Snapshots", run: testSeedBankCandidatesReturnEmptyForMissingSnapshots },
  { name: "Seed Bank Candidate Source Runs Page Search And Exclude Empty Runs", run: testSeedBankCandidateSourceRunsPageSearchAndExcludeEmptyRuns },
  { name: "Seed Bank Candidate Admission Freezes All Snapshots And Duplicates", run: testSeedBankCandidateAdmissionFreezesAllSnapshotsAndDuplicates },
  { name: "Seed Bank Candidate Admission Handles Birth Only And Missing Snapshots", run: testSeedBankCandidateAdmissionHandlesBirthOnlyAndMissingSnapshots },
  { name: "Seed Bank Candidate Batch Admission Matches Repeated Singles And Skips Duplicates", run: testSeedBankCandidateBatchAdmissionMatchesRepeatedSinglesAndSkipsDuplicates },
];
