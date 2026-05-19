import { db, statements } from "./db.mjs";

export function getLatestWorld(worldId) {
  const latest = statements.latestSnapshot.get(worldId);
  const counts = statements.countRows.get(worldId, worldId, worldId);
  return {
    latest: latest ? JSON.parse(latest.payload) : null,
    counts,
  };
}

export function saveSnapshot(worldId, snapshot) {
  statements.insertSnapshot.run(worldId, snapshot.tick, new Date().toISOString(), JSON.stringify(snapshot));
}

export function saveEvents(worldId, births, deaths) {
  transaction(() => {
    for (const event of births) {
      statements.insertBirth.run(
        `${worldId}:birth:${event.tick}:${event.childId}`,
        worldId,
        event.tick,
        event.parentId,
        event.childId,
        event.lineageId,
        event.generation,
        event.mutationSummary,
        JSON.stringify(event),
      );
    }
    for (const event of deaths) {
      statements.insertDeath.run(
        `${worldId}:death:${event.tick}:${event.agentId}`,
        worldId,
        event.tick,
        event.agentId,
        event.lineageId,
        event.cause,
        event.killedBy ?? null,
        JSON.stringify(event),
      );
    }
  });
}

function transaction(callback) {
  try {
    db.exec("BEGIN");
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
