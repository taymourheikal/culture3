import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const files = [
  "toy-market.sqlite",
  "toy-market.sqlite-wal",
  "toy-market.sqlite-shm",
  "sine-headless.sqlite",
  "sine-headless.sqlite-wal",
  "sine-headless.sqlite-shm",
];

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to reset Toy Market DB without --confirm. Stop the local API server first.");
}

for (const file of files) {
  const path = join(dataDir, file);
  if (!existsSync(path)) continue;
  rmSync(path, { force: true });
  console.log(`deleted ${path}`);
}
