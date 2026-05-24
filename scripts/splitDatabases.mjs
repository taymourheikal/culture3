import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const antDbPath = join(dataDir, "ant-world.sqlite");
const toyDbPath = join(dataDir, "toy-market.sqlite");

const sineTables = [
  "sine_sessions",
  "sine_spawner_births",
  "sine_spawner_deaths",
  "sine_spawner_genome_snapshots",
  "sine_spawner_state_snapshots",
  "sine_food_events",
  "sine_events",
  "sine_spawner_uniqueness_snapshots",
];

const dropOrder = [
  "sine_spawner_uniqueness_snapshots",
  "sine_events",
  "sine_food_events",
  "sine_spawner_state_snapshots",
  "sine_spawner_genome_snapshots",
  "sine_spawner_deaths",
  "sine_spawner_births",
  "sine_sessions",
];

const overwriteTarget = process.argv.includes("--overwrite-target");

await main();

async function main() {
  if (!existsSync(antDbPath)) throw new Error(`Missing source DB: ${antDbPath}`);
  if (await serverIsRunning()) {
    throw new Error("Stop the local API server on 127.0.0.1:8787 before splitting databases.");
  }

  const sourceCounts = readSourceCounts();
  if (!sourceCounts.hasSineTables) {
    const targetCounts = readTargetCountsIfPresent();
    if (targetCounts && totalRows(targetCounts) > 0) {
      console.log("Ant DB already has no sine_* tables, and toy-market.sqlite contains Toy Market data.");
      return;
    }
    throw new Error("Ant DB has no sine_* tables to migrate, and toy-market.sqlite has no migrated data.");
  }

  const backupPath = join(dataDir, `ant-world.pre-sine-split-${timestamp()}.sqlite`);
  createVerifiedBackup(backupPath);
  copySineTablesToToyDb(sourceCounts.counts, backupPath);
  dropSineTablesFromAntDb();
  copySineTablesToToyDb(sourceCounts.counts, backupPath, true);
  verifyFinalState(sourceCounts.counts);

  console.log(`Split complete.`);
  console.log(`Ant DB: ${antDbPath}`);
  console.log(`Toy Market DB: ${toyDbPath}`);
  console.log(`Backup: ${backupPath}`);
}

async function serverIsRunning() {
  try {
    const response = await fetch("http://127.0.0.1:8787/api/health", { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
}

function readSourceCounts() {
  const source = openDb(antDbPath);
  try {
    source.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    assertWritable(source);
    const existingTables = new Set(
      source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
    );
    const hasSineTables = sineTables.every((table) => existingTables.has(table));
    if (!hasSineTables && sineTables.some((table) => existingTables.has(table))) {
      throw new Error("Ant DB contains only some sine_* tables. Refusing partial migration.");
    }
    return { hasSineTables, counts: hasSineTables ? countTables(source, sineTables) : {} };
  } finally {
    source.close();
  }
}

function createVerifiedBackup(backupPath) {
  const source = openDb(antDbPath);
  try {
    source.exec(`VACUUM INTO ${sqlString(backupPath)};`);
    const backup = openDb(backupPath, true);
    try {
      const sourceCounts = countTables(source, sineTables);
      const backupCounts = countTables(backup, sineTables);
      assertCountsMatch(sourceCounts, backupCounts, "backup");
    } finally {
      backup.close();
    }
  } finally {
    source.close();
  }
}

async function copySineTablesToToyDb(expectedCounts, migrationSourcePath, replaceTarget = overwriteTarget) {
  const target = openDb(toyDbPath);
  try {
    target.exec("PRAGMA journal_mode = WAL;");
    target.exec(`ATTACH DATABASE ${sqlString(migrationSourcePath)} AS source;`);
    ensureTargetSchema(target);

    const targetCounts = countTables(target, sineTables, "main");
    if (totalRows(targetCounts) > 0) {
      if (!replaceTarget) {
        throw new Error("toy-market.sqlite already contains Toy Market data. Re-run with --overwrite-target to replace it.");
      }
      clearTarget(target);
    }

    try {
      target.exec("BEGIN;");
      for (const table of sineTables) {
        target.exec(`INSERT INTO main.${table} SELECT * FROM source.${table};`);
      }
      target.exec("COMMIT;");
    } catch (error) {
      target.exec("ROLLBACK;");
      throw error;
    } finally {
      target.exec("DETACH DATABASE source;");
    }

    assertCountsMatch(expectedCounts, countTables(target, sineTables, "main"), "toy-market.sqlite");
    assertNoForeignKeyErrors(target, "toy-market.sqlite");
    target.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    target.close();
  }

  const reopened = openDb(toyDbPath, true);
  try {
    assertCountsMatch(expectedCounts, countTables(reopened, sineTables), "reopened toy-market.sqlite");
    assertNoForeignKeyErrors(reopened, "reopened toy-market.sqlite");
  } finally {
    reopened.close();
  }
}

function ensureTargetSchema(db) {
  for (const table of sineTables) {
    if (tableExists(db, table, "main")) continue;
    const row = db.prepare("SELECT sql FROM source.sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row?.sql) throw new Error(`Missing source schema for ${table}`);
    db.exec(row.sql);
  }

  const indexes = db
    .prepare(
      `SELECT name, sql
       FROM source.sqlite_master
       WHERE type = 'index'
         AND sql IS NOT NULL
         AND tbl_name IN (${sineTables.map(() => "?").join(",")})
       ORDER BY name`,
    )
    .all(...sineTables);
  for (const index of indexes) {
    db.exec(index.sql.replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS "));
  }
}

function clearTarget(db) {
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN;");
    for (const table of dropOrder) db.exec(`DELETE FROM ${table};`);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function dropSineTablesFromAntDb() {
  const source = openDb(antDbPath);
  try {
    assertWritable(source);
    source.exec("PRAGMA foreign_keys = OFF;");
    source.exec("BEGIN;");
    try {
      for (const table of dropOrder) source.exec(`DROP TABLE IF EXISTS ${table};`);
      source.exec("COMMIT;");
    } catch (error) {
      source.exec("ROLLBACK;");
      throw error;
    } finally {
      source.exec("PRAGMA foreign_keys = ON;");
    }
    source.exec("VACUUM;");
  } finally {
    source.close();
  }
}

function verifyFinalState(expectedCounts) {
  const ant = openDb(antDbPath, true);
  try {
    const remaining = ant
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sine_%' ORDER BY name")
      .all();
    if (remaining.length > 0) {
      throw new Error(`Ant DB still contains sine_* tables: ${remaining.map((row) => row.name).join(", ")}`);
    }
  } finally {
    ant.close();
  }

  const toy = openDb(toyDbPath, true);
  try {
    assertCountsMatch(expectedCounts, countTables(toy, sineTables), "final toy-market.sqlite");
    assertNoForeignKeyErrors(toy, "final toy-market.sqlite");
  } finally {
    toy.close();
  }
}

function readTargetCountsIfPresent() {
  if (!existsSync(toyDbPath)) return null;
  const target = openDb(toyDbPath, true);
  try {
    return countTables(target, sineTables.filter((table) => tableExists(target, table)));
  } finally {
    target.close();
  }
}

function openDb(path, readOnly = false) {
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA busy_timeout = 2000;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function assertWritable(db) {
  try {
    db.exec("BEGIN IMMEDIATE;");
    db.exec("COMMIT;");
  } catch (error) {
    throw new Error(`Database is busy or not writable. Stop processes using it before migration. ${error.message}`);
  }
}

function countTables(db, tables, schema = null) {
  const counts = {};
  for (const table of tables) {
    if (!tableExists(db, table, schema)) throw new Error(`Missing table: ${schema ? `${schema}.` : ""}${table}`);
    counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${schema ? `${schema}.` : ""}${table}`).get().count);
  }
  return counts;
}

function tableExists(db, table, schema = null) {
  return !!db.prepare(`SELECT name FROM ${schema ? `${schema}.` : ""}sqlite_master WHERE type = 'table' AND name = ?`).get(table);
}

function assertCountsMatch(expected, actual, label) {
  for (const table of sineTables) {
    if (expected[table] !== actual[table]) {
      throw new Error(`${label} row count mismatch for ${table}: expected ${expected[table]}, got ${actual[table]}`);
    }
  }
}

function assertNoForeignKeyErrors(db, label) {
  const errors = db.prepare("PRAGMA foreign_key_check").all();
  if (errors.length > 0) throw new Error(`${label} has foreign key errors: ${JSON.stringify(errors.slice(0, 5))}`);
}

function totalRows(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
