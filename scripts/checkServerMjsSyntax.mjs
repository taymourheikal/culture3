import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const serverDir = fileURLToPath(new URL("../server/", import.meta.url));
const files = readdirSync(serverDir)
  .filter((file) => file.endsWith(".mjs"))
  .sort()
  .map((file) => join(serverDir, file));

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} server .mjs files.`);
