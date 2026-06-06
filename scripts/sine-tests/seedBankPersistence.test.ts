import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SineTest } from "./helpers";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { createSineSeedBankRepository } from "../../server/sineSeedBankRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";

function testSeedBankRepositoryCreatesIndependentDb() {
  withTempSeedBankRepository((repository, dbPath) => {
    const bank = repository.createSeedBank({ id: "bank-alpha", label: "Alpha", description: "First bank" });
    assert.equal(bank.id, "bank-alpha");
    assert.equal(bank.label, "Alpha");
    assert.equal(bank.description, "First bank");
    assert.equal(existsSync(dbPath), true);
    assert.equal(repository.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);

    const seedBankTables = tableNames(repository.db).filter((name: string) => name.startsWith("seed_bank"));
    assert.deepEqual(seedBankTables.sort(), ["seed_bank_entries", "seed_bank_entry_snapshots", "seed_banks"].sort());

    const mainDbSeedBankTables = tableNames(sineDb).filter((name: string) => name.startsWith("seed_bank"));
    assert.deepEqual(mainDbSeedBankTables, []);
  });
}

function testSeedBankRepositoryStoresFrozenEntrySnapshots() {
  withTempSeedBankRepository((repository) => {
    repository.createSeedBank({ id: "bank-beta", label: "Beta" });
    const added = repository.addFrozenEntry(frozenEntryFixture("bank-beta"));
    assert.equal(added.inserted, true);
    assert.equal(added.entry.bankId, "bank-beta");
    assert.equal(added.entry.source.runId, "missing-source-run");
    assert.equal(added.entry.source.spawnerId, 7);
    assert.equal(added.entry.source.lineageId, 3);
    assert.equal(added.entry.source.generation, 2);
    assert.equal(added.entry.source.parentSpawnerId, 4);
    assert.equal(added.entry.source.birthTick, 10);
    assert.equal(added.entry.source.deathTick, 90);
    assert.equal(added.entry.source.lifespanTicks, 80);
    assert.equal(added.entry.reconstructionSnapshotCount, 2);
    assert.deepEqual(added.entry.admission.metrics, { resolvedTrades: 25, children: 3, sharpe: 1.2 });
    assert.deepEqual(added.entry.admission.filters, { minimumResolvedTrades: 25, minimumChildren: 2 });
    assert.equal(added.entry.snapshots.length, 2);
    assert.deepEqual(added.entry.snapshots.map((snapshot: any) => snapshot.sourceReason), ["birth", "trade_interval"]);
    assert.deepEqual(added.entry.snapshots[0]?.genome, { units: [{ unitId: 1 }], connections: [] });
    assert.deepEqual(added.entry.snapshots[1]?.hiddenState, { "1": 0.2 });
    assert.deepEqual(added.entry.snapshots[1]?.learnedState, { learnedConnectionDeltas: { c1: 0.5 } });

    const snapshotColumns = tableColumnNames(repository.db, "seed_bank_entry_snapshots");
    assert.equal(snapshotColumns.includes("is_primary"), false);
    assert.equal(snapshotColumns.includes("primary"), false);
    assert.equal(snapshotColumns.includes("spawner_json"), false);

    const entryColumns = tableColumnNames(repository.db, "seed_bank_entries");
    assert.equal(entryColumns.includes("spawner_json"), false);
    assert.equal(entryColumns.includes("energy"), false);
    assert.equal(entryColumns.includes("health"), false);
  });
}

function testSeedBankRepositoryPreventsDuplicateSourceAgents() {
  withTempSeedBankRepository((repository) => {
    repository.createSeedBank({ id: "bank-gamma", label: "Gamma" });
    const first = repository.addFrozenEntry(frozenEntryFixture("bank-gamma"));
    const second = repository.addFrozenEntry({
      ...frozenEntryFixture("bank-gamma"),
      id: "different-entry-id",
      admission: { metrics: { resolvedTrades: 99 }, filters: { minimumResolvedTrades: 99 } },
      snapshots: [
        {
          sourceTick: 100,
          sourceReason: "final",
          schemaVersion: 1,
          genome: { units: [{ unitId: 99 }], connections: [] } as any,
          hiddenState: {},
          learnedState: {},
        },
      ],
    });
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(second.entry.id, first.entry.id);
    assert.equal(second.entry.reconstructionSnapshotCount, 2);
    const summaries = repository.listEntries("bank-gamma");
    assert.equal(summaries.length, 1);
    assert.equal(Object.hasOwn(summaries[0], "snapshots"), false);
  });
}

function testSeedBankFrozenEntrySurvivesWithoutSourceRunRows() {
  const { dir, dbPath } = tempSeedBankPath();
  let entryId = "";
  try {
    const first = createSineSeedBankRepository({ dbPath });
    try {
      first.createSeedBank({ id: "bank-delta", label: "Delta" });
      const added = first.addFrozenEntry(frozenEntryFixture("bank-delta"));
      entryId = added.entry.id;
    } finally {
      first.close();
    }

    const reopened = createSineSeedBankRepository({ dbPath });
    try {
      const entry = reopened.getEntry(entryId);
      assert.ok(entry);
      assert.equal(entry.source.runId, "missing-source-run");
      assert.equal(entry.snapshots.length, 2);
      assert.deepEqual(entry.snapshots[0]?.genome, { units: [{ unitId: 1 }], connections: [] });
      assert.deepEqual(reopened.listSeedBanks().map((bank: any) => bank.id), ["bank-delta"]);
      const summaries = reopened.listEntries("bank-delta");
      assert.deepEqual(summaries.map((row: any) => row.id), [entryId]);
      assert.equal(Object.hasOwn(summaries[0], "snapshots"), false);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testSeedBankRepositoryUpdatesBanksAndCascadesEntries() {
  withTempSeedBankRepository((repository) => {
    repository.createSeedBank({ id: "bank-epsilon", label: "Before" });
    const updated = repository.updateSeedBank("bank-epsilon", { label: "After", description: "Updated description" });
    assert.equal(updated.label, "After");
    assert.equal(updated.description, "Updated description");
    assert.notEqual(updated.updatedAt, null);

    repository.addFrozenEntry(frozenEntryFixture("bank-epsilon"));
    assert.equal(repository.listEntries("bank-epsilon").length, 1);
    repository.db.prepare("DELETE FROM seed_banks WHERE id = ?").run("bank-epsilon");
    assert.equal(repository.db.prepare("SELECT COUNT(*) AS count FROM seed_bank_entries").get().count, 0);
    assert.equal(repository.db.prepare("SELECT COUNT(*) AS count FROM seed_bank_entry_snapshots").get().count, 0);
    assert.deepEqual(repository.db.prepare("PRAGMA foreign_key_check").all(), []);
  });
}

function frozenEntryFixture(bankId: string) {
  return {
    id: "entry-alpha",
    bankId,
    source: {
      runId: "missing-source-run",
      spawnerId: 7,
      lineageId: 3,
      generation: 2,
      parentSpawnerId: 4,
      birthTick: 10,
      deathTick: 90,
      lifespanTicks: 80,
    },
    admission: {
      metrics: { resolvedTrades: 25, children: 3, sharpe: 1.2 },
      filters: { minimumResolvedTrades: 25, minimumChildren: 2 },
    },
    snapshots: [
      {
        sourceTick: 10,
        sourceReason: "birth",
        schemaVersion: 1,
        genome: { units: [{ unitId: 1 }], connections: [] } as any,
        hiddenState: { "1": 0.1 },
        learnedState: { learnedConnectionDeltas: {} },
      },
      {
        sourceTick: 50,
        sourceReason: "trade_interval",
        schemaVersion: 1,
        genome: { units: [{ unitId: 1 }, { unitId: 2 }], connections: [{ innovationId: 1 }] } as any,
        hiddenState: { "1": 0.2 },
        learnedState: { learnedConnectionDeltas: { c1: 0.5 } },
      },
    ],
  };
}

function withTempSeedBankRepository(callback: (repository: ReturnType<typeof createSineSeedBankRepository>, dbPath: string) => void) {
  const { dir, dbPath } = tempSeedBankPath();
  const repository = createSineSeedBankRepository({ dbPath });
  try {
    callback(repository, dbPath);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function tempSeedBankPath() {
  const dir = mkdtempSync(join(tmpdir(), "sine-seed-bank-"));
  return { dir, dbPath: join(dir, "seed-bank.sqlite") };
}

function tableNames(db: any) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row: any) => row.name)
    .filter((name: string) => name !== "sqlite_sequence");
}

function tableColumnNames(db: any, tableName: string) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row: any) => row.name);
}

export const tests: SineTest[] = [
  { name: "Seed Bank Repository Creates Independent Db", run: testSeedBankRepositoryCreatesIndependentDb },
  { name: "Seed Bank Repository Stores Frozen Entry Snapshots", run: testSeedBankRepositoryStoresFrozenEntrySnapshots },
  { name: "Seed Bank Repository Prevents Duplicate Source Agents", run: testSeedBankRepositoryPreventsDuplicateSourceAgents },
  { name: "Seed Bank Frozen Entry Survives Without Source Run Rows", run: testSeedBankFrozenEntrySurvivesWithoutSourceRunRows },
  { name: "Seed Bank Repository Updates Banks And Cascades Entries", run: testSeedBankRepositoryUpdatesBanksAndCascadesEntries },
];
