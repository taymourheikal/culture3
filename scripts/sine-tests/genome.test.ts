import { strict as assert } from "node:assert";
import { activeConnections, activeLayerIndexes, activeUnits, addRandomLegalConnection, architectureMetrics, connectionInnovationId, createSpawnerWorld, forwardSpawner, getOrCreateConnectionInnovationId, INPUT_COUNT, isLegalConnection, mutateGenome, OUTPUT_COUNT, OUTPUT_INDEX, SeededRng } from "../../src/sine/spawnerSimulation";
import { round, runTo, type SineTest } from "./helpers";

function testFixedSpawnerForwardSnapshot() {
  const firstWorld = createSpawnerWorld(101);
  const secondWorld = createSpawnerWorld(101);
  const firstSpawner = firstWorld.spawners[0];
  const secondSpawner = secondWorld.spawners[0];
  assert(firstSpawner);
  assert(secondSpawner);

  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Number(((index - 8) / 10).toFixed(3)));
  const hiddenState = Object.fromEntries(firstSpawner.genome.units.map((unit, index) => [unit.unitId, Number((index / 20).toFixed(3))]));
  firstSpawner.hiddenState = { ...hiddenState };
  secondSpawner.hiddenState = { ...hiddenState };

  const firstOutput = forwardSpawner(firstSpawner, inputs).map(round);
  const secondOutput = forwardSpawner(secondSpawner, inputs).map(round);
  assert.deepEqual(firstOutput, secondOutput);
  assert.equal(firstOutput.length, OUTPUT_COUNT);
  assert(firstOutput.every(Number.isFinite));
  assert(Object.values(firstSpawner.hiddenState).every(Number.isFinite));
}

function testSparseInnovationIdsAreStable() {
  const source = { kind: "input" as const, index: 3 };
  const target = { kind: "hidden" as const, unitId: 7, gate: "candidate" as const };
  assert.equal(connectionInnovationId(source, target), connectionInnovationId(source, target));
  assert.notEqual(connectionInnovationId(source, target), connectionInnovationId({ kind: "input", index: 4 }, target));
}

function testFounderUnitInnovationIdsAreWorldUnique() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 5,
    initialHiddenUnitsMin: 3,
    initialHiddenUnitsMax: 3,
  });
  const ids = world.spawners.flatMap((spawner) => spawner.genome.units.map((unit) => unit.innovationId));
  assert.equal(new Set(ids).size, ids.length);
}

function testFounderTopologyCanConnectNewestInput() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    initialInputConnectionsPerUnit: INPUT_COUNT * 3,
    initialRecurrentConnectionsPerUnit: 0,
    initialOutputConnectionsPerOutput: 1,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  assert(
    activeConnections(spawner.genome).some((connection) => connection.source.kind === "input" && connection.source.index === INPUT_COUNT - 1),
    "founder sparse topology should be able to wire the 16th input",
  );
}

function testOldFifteenInputGenomeRemainsForwardCompatible() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.connections = spawner.genome.connections.filter(
    (connection) => connection.source.kind !== "input" || connection.source.index < INPUT_COUNT - 1,
  );
  const outputs = forwardSpawner(spawner, Array.from({ length: INPUT_COUNT }, () => 0));
  assert.equal(outputs.length, OUTPUT_COUNT);
  assert(outputs.every(Number.isFinite));
}

function testConnectionInnovationRegistryReusesIds() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    mutationProfileMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  const source = { kind: "input" as const, index: 0 };
  const target = { kind: "hidden" as const, unitId: unit.unitId, gate: "candidate" as const };
  const first = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, source, target);
  const second = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, source, target);
  const different = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, { kind: "input", index: 1 }, target);
  assert.equal(first, second);
  assert.notEqual(first, different);

  const child = mutateGenome(spawner.genome, new SeededRng(1), {
    ...world.config,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
  }, world.innovations);
  assert.deepEqual(
    child.connections.map((connection) => connection.innovationId),
    spawner.genome.connections.map((connection) => connection.innovationId),
  );
}

function testOutputConnectionLegalityRejectsPreviousHidden() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  assert.equal(
    isLegalConnection(spawner.genome, { kind: "hidden", unitId: unit.unitId, mode: "previous" }, { kind: "output", index: 0 }, world.config),
    false,
  );
  assert.equal(
    isLegalConnection(spawner.genome, { kind: "hidden", unitId: unit.unitId, mode: "current" }, { kind: "output", index: 0 }, world.config),
    true,
  );
  assert.equal(
    isLegalConnection(spawner.genome, { kind: "hidden", unitId: unit.unitId, mode: "current" }, { kind: "output", index: OUTPUT_INDEX.reproduce }, world.config),
    true,
  );
}

function testReenableConnectionSkipsIllegalConnections() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 1,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    mutationProfileMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.genome.connections.push({
    innovationId: 999_999,
    source: { kind: "hidden", unitId: unit.unitId, mode: "previous" },
    target: { kind: "output", index: 0 },
    weight: 1,
    enabled: false,
  });
  const child = mutateGenome(spawner.genome, new SeededRng(1), {
    ...world.config,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 1,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
  }, world.innovations);
  const illegal = child.connections.find((connection) => connection.innovationId === 999_999);
  assert.equal(illegal?.enabled, false);
}

function testSparseConnectionRulesAndMutation() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    addUnitRate: 1,
    addConnectionRate: 1,
    weightMutationRate: 1,
    biasMutationRate: 1,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const before = architectureMetrics(spawner.genome);
  const child = mutateGenome(spawner.genome, new SeededRng(909), world.config, world.innovations);
  const after = architectureMetrics(child);
  assert(after.activeUnits >= before.activeUnits);
  assert(after.activeConnections >= before.activeConnections);
  assert(activeLayerIndexes(child).every((layer) => layer >= 1));

  const units = activeUnits(child);
  const lower = units.find((unit) => unit.layerIndex === Math.min(...units.map((unit) => unit.layerIndex)));
  const higher = units.find((unit) => lower && unit.layerIndex > lower.layerIndex);
  if (lower && higher) {
    assert.equal(
      isLegalConnection(
        child,
        { kind: "hidden", unitId: higher.unitId, mode: "current" },
        { kind: "hidden", unitId: lower.unitId, gate: "update" },
        world.config,
      ),
      false,
    );
  }

  for (let index = 0; index < 1000; index += 1) {
    const added = addRandomLegalConnection(child, new SeededRng(1000 + index), world.config, world.innovations);
    if (!added) break;
  }
  const seen = new Set<string>();
  for (const connection of activeConnections(child)) {
    const key = JSON.stringify([connection.source, connection.target]);
    assert(!seen.has(key));
    seen.add(key);
    assert(isLegalConnection(child, connection.source, connection.target, world.config));
  }
}

export const tests: SineTest[] = [
  { name: "Fixed Spawner Forward Snapshot", run: testFixedSpawnerForwardSnapshot },
  { name: "Sparse Innovation Ids Are Stable", run: testSparseInnovationIdsAreStable },
  { name: "Founder Unit Innovation Ids Are World Unique", run: testFounderUnitInnovationIdsAreWorldUnique },
  { name: "Founder Topology Can Connect Newest Input", run: testFounderTopologyCanConnectNewestInput },
  { name: "Old Fifteen Input Genome Remains Forward Compatible", run: testOldFifteenInputGenomeRemainsForwardCompatible },
  { name: "Connection Innovation Registry Reuses Ids", run: testConnectionInnovationRegistryReusesIds },
  { name: "Output Connection Legality Rejects Previous Hidden", run: testOutputConnectionLegalityRejectsPreviousHidden },
  { name: "Reenable Connection Skips Illegal Connections", run: testReenableConnectionSkipsIllegalConnections },
  { name: "Sparse Connection Rules And Mutation", run: testSparseConnectionRulesAndMutation },
];
