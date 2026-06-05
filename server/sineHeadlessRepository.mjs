import { sineDb } from "./sineDb.mjs";
import {
  createSineHeadlessUnifiedReadRepository,
  defaultSineHeadlessDbPath,
  markInterruptedUnifiedHeadlessRunsFailed,
} from "./sineHeadlessUnifiedReadRepository.mjs";
import { createSineHeadlessUnifiedWriteSink } from "./sineHeadlessUnifiedWriteRepository.mjs";

export { defaultSineHeadlessDbPath };

export function markInterruptedSineHeadlessRunsFailed(_dbPath = defaultSineHeadlessDbPath) {
  // dbPath is retained for callers from the former split-DB API. Unified headless runs always use sineDb.
  return markInterruptedUnifiedHeadlessRunsFailed();
}

export function createSineHeadlessRepository(_dbPath = defaultSineHeadlessDbPath, _options = {}) {
  // Arguments are compatibility-only; the unified Toy Market DB is process-owned by sineDb.mjs.
  const readRepository = createSineHeadlessUnifiedReadRepository(sineDb);
  return {
    db: sineDb,
    dbPath: defaultSineHeadlessDbPath,
    close() {
      // The unified Toy Market DB is process-owned by sineDb.mjs.
    },
    sink: createSineHeadlessUnifiedWriteSink(),
    ...readRepository,
  };
}
