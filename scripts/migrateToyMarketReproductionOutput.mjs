import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dbPath = join(rootDir, "data", "toy-market.sqlite");
const removedKeys = ["reproductionMinResolved", "reproductionMinAveragePayoff"];

if (!existsSync(dbPath)) {
  console.log("Toy Market DB not found; nothing to migrate.");
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sine_sessions'").get();
  if (!table) {
    console.log("sine_sessions table not found; nothing to migrate.");
    process.exit(0);
  }

  const rows = db.prepare("SELECT id, spawner_config_json FROM sine_sessions").all();
  const update = db.prepare("UPDATE sine_sessions SET spawner_config_json = ? WHERE id = ?");
  let changed = 0;

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const config = parseConfig(row.spawner_config_json);
      const before = JSON.stringify(config);
      for (const key of removedKeys) delete config[key];
      const after = JSON.stringify(config);
      if (after !== before) {
        update.run(after, row.id);
        changed += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  console.log(`Toy Market reproduction-output migration complete. Updated ${changed} session config row(s).`);
} finally {
  db.close();
}

function parseConfig(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
