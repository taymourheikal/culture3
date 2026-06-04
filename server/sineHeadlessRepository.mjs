import { defaultSineHeadlessDbPath, openSineHeadlessDb } from "./sineHeadlessDb.mjs";
import { createSineHeadlessReadRepository } from "./sineHeadlessReadRepository.mjs";
import { createSineHeadlessStatements } from "./sineHeadlessStatements.mjs";
import { createSineHeadlessWriteSink } from "./sineHeadlessWriteRepository.mjs";

export { defaultSineHeadlessDbPath };

export function markInterruptedSineHeadlessRunsFailed(dbPath = defaultSineHeadlessDbPath) {
  const db = openSineHeadlessDb(dbPath);
  try {
    return db.prepare(`
      UPDATE sine_headless_runs
      SET
        completed_at = ?,
        status = 'failed',
        tick = COALESCE((SELECT MAX(tick) FROM sine_headless_run_checkpoints WHERE run_id = sine_headless_runs.id), tick),
        termination_reason = 'interrupted',
        error = 'Interrupted by server restart'
      WHERE status = 'running'
    `).run(new Date().toISOString()).changes;
  } finally {
    db.close();
  }
}

export function createSineHeadlessRepository(dbPath = defaultSineHeadlessDbPath) {
  const db = openSineHeadlessDb(dbPath);
  const statements = createSineHeadlessStatements(db);
  const readRepository = createSineHeadlessReadRepository(db, statements);

  return {
    db,
    dbPath,
    close() {
      db.close();
    },
    sink: createSineHeadlessWriteSink(db, statements),
    ...readRepository,
  };
}
