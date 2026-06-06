import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeSineSeedBankSchema } from "./sineSeedBankSchema.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");

export const defaultSineSeedBankDbPath = join(dataDir, "seed-bank.sqlite");
export const activeSineSeedBankDbPath = process.env.SINE_SEED_BANK_DB_PATH || defaultSineSeedBankDbPath;

let defaultDb = null;

export function openSineSeedBankDb(dbPath = activeSineSeedBankDbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  initializeSineSeedBankSchema(db);
  return db;
}

export function getSineSeedBankDb() {
  if (!defaultDb) defaultDb = openSineSeedBankDb(activeSineSeedBankDbPath);
  return defaultDb;
}
