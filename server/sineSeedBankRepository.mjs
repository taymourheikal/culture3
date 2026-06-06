import { randomUUID } from "node:crypto";
import { getSineSeedBankDb, openSineSeedBankDb, defaultSineSeedBankDbPath } from "./sineSeedBankDb.mjs";
import { initializeSineSeedBankSchema } from "./sineSeedBankSchema.mjs";
import { boundedInteger, integerNumber, parseJson, stringifyJson } from "./sineRepositoryUtils.mjs";

export { defaultSineSeedBankDbPath };

export function createSineSeedBankRepository(options = {}) {
  const ownsDb = !options.db && Boolean(options.dbPath);
  const db = options.db ?? (options.dbPath ? openSineSeedBankDb(options.dbPath) : getSineSeedBankDb());
  initializeSineSeedBankSchema(db);

  return {
    db,
    dbPath: options.dbPath ?? defaultSineSeedBankDbPath,
    close() {
      if (ownsDb && typeof db.close === "function") db.close();
    },
    createSeedBank(input = {}) {
      return createSeedBank(db, input);
    },
    updateSeedBank(id, input = {}) {
      return updateSeedBank(db, id, input);
    },
    listSeedBanks() {
      return listSeedBanks(db);
    },
    getSeedBank(id) {
      return getSeedBank(db, id);
    },
    addFrozenEntry(input) {
      return addFrozenEntry(db, input);
    },
    hasEntry(bankId, sourceRunId, sourceSpawnerId) {
      return Boolean(existingEntryRow(db, bankId, sourceRunId, sourceSpawnerId));
    },
    admittedSourceKeys(bankId, runIds = []) {
      return admittedSourceKeys(db, bankId, runIds);
    },
    listEntries(bankId) {
      return listEntrySummaries(db, bankId);
    },
    listEntrySummaries(bankId) {
      return listEntrySummaries(db, bankId);
    },
    getEntry(entryId) {
      return getEntry(db, entryId);
    },
  };
}

function createSeedBank(db, input) {
  const now = new Date().toISOString();
  const bank = {
    id: readText(input.id, randomUUID()),
    label: readRequiredText(input.label, "Untitled seed bank"),
    description: readText(input.description, ""),
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO seed_banks (id, label, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(bank.id, bank.label, bank.description, bank.createdAt, bank.updatedAt);
  return bank;
}

function updateSeedBank(db, id, input) {
  const existing = getSeedBank(db, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const label = input.label === undefined ? existing.label : readRequiredText(input.label, existing.label);
  const description = input.description === undefined ? existing.description : readText(input.description, "");
  db.prepare(`
    UPDATE seed_banks
    SET label = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(label, description, now, id);
  return getSeedBank(db, id);
}

function listSeedBanks(db) {
  return db.prepare(`
    SELECT *
    FROM seed_banks
    ORDER BY updated_at DESC, created_at DESC, id ASC
  `).all().map(bankFromRow);
}

function getSeedBank(db, id) {
  const row = db.prepare("SELECT * FROM seed_banks WHERE id = ?").get(id);
  return row ? bankFromRow(row) : null;
}

function addFrozenEntry(db, input) {
  validateFrozenEntryInput(input);
  const existing = existingEntryRow(db, input.bankId, input.source.runId, input.source.spawnerId);
  if (existing) return { inserted: false, entry: entryFromRow(db, existing) };
  if (!getSeedBank(db, input.bankId)) throw new Error(`Seed bank not found: ${input.bankId}`);

  const now = new Date().toISOString();
  const entryId = readText(input.id, randomUUID());
  return transaction(db, () => {
    db.prepare(`
      INSERT INTO seed_bank_entries (
        id,
        bank_id,
        source_run_id,
        source_spawner_id,
        source_lineage_id,
        source_generation,
        source_parent_spawner_id,
        source_birth_tick,
        source_death_tick,
        source_lifespan_ticks,
        source_reconstruction_snapshot_count,
        admission_metrics_json,
        admission_filters_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      input.bankId,
      input.source.runId,
      integerNumber(input.source.spawnerId, 0),
      integerNumber(input.source.lineageId, 0),
      integerNumber(input.source.generation, 0),
      integerOrNull(input.source.parentSpawnerId),
      integerOrNull(input.source.birthTick),
      integerOrNull(input.source.deathTick),
      integerOrNull(input.source.lifespanTicks),
      input.snapshots.length,
      stringifyJson(input.admission.metrics ?? {}),
      stringifyJson(input.admission.filters ?? {}),
      now,
    );
    const insertSnapshot = db.prepare(`
      INSERT INTO seed_bank_entry_snapshots (
        entry_id,
        source_snapshot_tick,
        source_snapshot_reason,
        schema_version,
        genome_json,
        hidden_state_json,
        learned_state_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const snapshot of input.snapshots) {
      insertSnapshot.run(
        entryId,
        integerNumber(snapshot.sourceTick, 0),
        readRequiredText(snapshot.sourceReason, "unknown"),
        boundedInteger(snapshot.schemaVersion, 1, 1, 1000000),
        stringifyJson(snapshot.genome ?? {}),
        stringifyJson(snapshot.hiddenState ?? {}),
        stringifyJson(snapshot.learnedState ?? {}),
        snapshot.createdAt ?? now,
      );
    }
    return { inserted: true, entry: getEntry(db, entryId) };
  });
}

function listEntrySummaries(db, bankId) {
  return db.prepare(`
    SELECT *
    FROM seed_bank_entries
    WHERE bank_id = ?
    ORDER BY created_at DESC, id ASC
  `).all(bankId).map(entrySummaryFromRow);
}

function getEntry(db, entryId) {
  const row = db.prepare("SELECT * FROM seed_bank_entries WHERE id = ?").get(entryId);
  return row ? entryFromRow(db, row) : null;
}

function existingEntryRow(db, bankId, sourceRunId, sourceSpawnerId) {
  return db.prepare(`
    SELECT *
    FROM seed_bank_entries
    WHERE bank_id = ? AND source_run_id = ? AND source_spawner_id = ?
  `).get(bankId, sourceRunId, integerNumber(sourceSpawnerId, 0));
}

function admittedSourceKeys(db, bankId, runIds) {
  const normalizedRunIds = [...new Set((Array.isArray(runIds) ? runIds : []).map((runId) => readText(runId, "")).filter(Boolean))];
  if (!readText(bankId, "") || normalizedRunIds.length === 0) return new Set();
  const placeholders = normalizedRunIds.map(() => "?").join(", ");
  return new Set(db.prepare(`
    SELECT source_run_id, source_spawner_id
    FROM seed_bank_entries
    WHERE bank_id = ? AND source_run_id IN (${placeholders})
  `).all(bankId, ...normalizedRunIds).map((row) => sourceKey(row.source_run_id, row.source_spawner_id)));
}

function snapshotsForEntry(db, entryId) {
  return db.prepare(`
    SELECT *
    FROM seed_bank_entry_snapshots
    WHERE entry_id = ?
    ORDER BY source_snapshot_tick ASC, source_snapshot_reason ASC
  `).all(entryId).map((row) => ({
    sourceTick: row.source_snapshot_tick,
    sourceReason: row.source_snapshot_reason,
    schemaVersion: row.schema_version,
    genome: parseJson(row.genome_json, null),
    hiddenState: parseJson(row.hidden_state_json, {}),
    learnedState: parseJson(row.learned_state_json, {}),
    createdAt: row.created_at,
  }));
}

function entryFromRow(db, row) {
  return {
    ...entrySummaryFromRow(row),
    snapshots: snapshotsForEntry(db, row.id),
  };
}

function entrySummaryFromRow(row) {
  return {
    id: row.id,
    bankId: row.bank_id,
    source: {
      runId: row.source_run_id,
      spawnerId: row.source_spawner_id,
      lineageId: row.source_lineage_id,
      generation: row.source_generation,
      parentSpawnerId: row.source_parent_spawner_id ?? null,
      birthTick: row.source_birth_tick ?? null,
      deathTick: row.source_death_tick ?? null,
      lifespanTicks: row.source_lifespan_ticks ?? null,
    },
    reconstructionSnapshotCount: row.source_reconstruction_snapshot_count,
    admission: {
      metrics: parseJson(row.admission_metrics_json, {}),
      filters: parseJson(row.admission_filters_json, {}),
    },
    createdAt: row.created_at,
  };
}

function bankFromRow(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateFrozenEntryInput(input) {
  if (!input || typeof input !== "object") throw new Error("Missing seed-bank entry");
  if (!readText(input.bankId, "")) throw new Error("Missing seed bank id");
  if (!input.source || typeof input.source !== "object") throw new Error("Missing source agent");
  if (!readText(input.source.runId, "")) throw new Error("Missing source run id");
  if (!Number.isFinite(Number(input.source.spawnerId))) throw new Error("Missing source spawner id");
  if (!input.admission || typeof input.admission !== "object") throw new Error("Missing admission context");
  if (!Array.isArray(input.snapshots) || input.snapshots.length === 0) throw new Error("Seed-bank entry requires at least one reconstruction snapshot");
}

function transaction(db, callback) {
  let began = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    began = true;
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (began) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original error.
      }
    }
    throw error;
  }
}

function readText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readRequiredText(value, fallback) {
  return readText(value, fallback);
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

function sourceKey(runId, spawnerId) {
  return `${runId}:${integerNumber(spawnerId, 0)}`;
}
