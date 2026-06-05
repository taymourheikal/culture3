import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeSineSchema } from "./sineSchema.mjs";
import { createSineStatements } from "./sineStatements.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
mkdirSync(dataDir, { recursive: true });

export const defaultSineDbPath = join(dataDir, "toy-market.sqlite");
export const activeSineDbPath = process.env.SINE_DB_PATH || defaultSineDbPath;
export const sineDb = new DatabaseSync(activeSineDbPath);

initializeSineSchema(sineDb);

export const sineStatements = createSineStatements(sineDb);
