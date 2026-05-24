import { antDb, antStatements } from "./antDb.mjs";

export function getLatestWorld(worldId) {
  const latest = antStatements.latestSnapshot.get(worldId);
  const counts = antStatements.countRows.get(worldId, worldId, worldId);
  return {
    latest: latest ? JSON.parse(latest.payload) : null,
    counts,
  };
}

export function saveSnapshot(worldId, snapshot) {
  antStatements.insertSnapshot.run(worldId, snapshot.tick, new Date().toISOString(), JSON.stringify(snapshot));
}

export function saveEvents(worldId, births, deaths) {
  transaction(() => {
    for (const event of births) {
      antStatements.insertBirth.run(
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
      antStatements.insertDeath.run(
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
    antDb.exec("BEGIN");
    const result = callback();
    antDb.exec("COMMIT");
    return result;
  } catch (error) {
    antDb.exec("ROLLBACK");
    throw error;
  }
}
