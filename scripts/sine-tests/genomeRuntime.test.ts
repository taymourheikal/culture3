import { strict as assert } from "node:assert";
import { activeConnections, activeLayerIndexes, activeUnits, addRandomLegalConnection, alignHiddenState, architectureMetrics, connectionInnovationId, createSpawnerWorld, forwardSpawner, getOrCreateConnectionInnovationId, isLegalConnection, mutateGenome, SeededRng, validateGenome } from "../../src/sine/spawnerSimulation";
import { round, runTo, type SineTest } from "./helpers";

function testHiddenStateAlignmentForReenabledUnits() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.hiddenState[unit.unitId] = Number.NaN;
  alignHiddenState(spawner);
  assert.equal(spawner.hiddenState[unit.unitId], 0);
  delete spawner.hiddenState[unit.unitId];
  const outputs = forwardSpawner(spawner, Array.from({ length: 15 }, () => 0));
  assert(outputs.every(Number.isFinite));
  assert(Number.isFinite(spawner.hiddenState[unit.unitId]));
}

function testDeeperLayerUsesLowerLayerCurrentState() {
  const world = createSpawnerWorld(707, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.hiddenState = { 1: 0, 2: 0 };
  spawner.genome = {
    units: [
      { unitId: 1, innovationId: 1, layerIndex: 1, enabled: true, updateBias: 10, resetBias: 0, candidateBias: 0 },
      { unitId: 2, innovationId: 2, layerIndex: 2, enabled: true, updateBias: 10, resetBias: 0, candidateBias: 0 },
    ],
    connections: [
      {
        innovationId: connectionInnovationId({ kind: "input", index: 0 }, { kind: "hidden", unitId: 1, gate: "candidate" }),
        source: { kind: "input", index: 0 },
        target: { kind: "hidden", unitId: 1, gate: "candidate" },
        weight: 2,
        enabled: true,
      },
      {
        innovationId: connectionInnovationId(
          { kind: "hidden", unitId: 1, mode: "current" },
          { kind: "hidden", unitId: 2, gate: "candidate" },
        ),
        source: { kind: "hidden", unitId: 1, mode: "current" },
        target: { kind: "hidden", unitId: 2, gate: "candidate" },
        weight: 2,
        enabled: true,
      },
      {
        innovationId: connectionInnovationId({ kind: "hidden", unitId: 2, mode: "current" }, { kind: "output", index: 0 }),
        source: { kind: "hidden", unitId: 2, mode: "current" },
        target: { kind: "output", index: 0 },
        weight: 1,
        enabled: true,
      },
    ],
    outputBias: [0, 0, 0, 0, 0],
    nextUnitId: 3,
    mutationStd: 0,
    thresholdBias: 0,
    minHorizon: 1,
    maxHorizon: 2,
    cooldownBase: 1,
  };
  const outputs = forwardSpawner(spawner, [1, ...Array.from({ length: 14 }, () => 0)]);
  assert((outputs[0] ?? 0) > 0.5);
  assert.equal(
    isLegalConnection(
      spawner.genome,
      { kind: "hidden", unitId: 2, mode: "current" },
      { kind: "hidden", unitId: 1, gate: "candidate" },
      world.config,
    ),
    false,
  );
}

function testSparseFounderTopologyGuarantees() {
  const world = createSpawnerWorld(303, {
    initialSpawners: 4,
    initialHiddenUnitsMin: 5,
    initialHiddenUnitsMax: 5,
    initialInputConnectionsPerUnit: 3,
    initialRecurrentConnectionsPerUnit: 1,
    initialOutputConnectionsPerOutput: 2,
  });
  for (const spawner of world.spawners) {
    assert.equal(activeUnits(spawner.genome).length, 5);
    for (let output = 0; output < 5; output += 1) {
      assert(activeConnections(spawner.genome).some((connection) => connection.target.kind === "output" && connection.target.index === output));
    }
    for (const connection of activeConnections(spawner.genome)) {
      assert(isLegalConnection(spawner.genome, connection.source, connection.target, world.config));
    }
  }
}

function testZeroMutationLeavesGenomeUnchanged() {
  const world = createSpawnerWorld(404, {
    initialSpawners: 1,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const before = JSON.stringify(spawner.genome);
  const child = mutateGenome(spawner.genome, new SeededRng(1), world.config, world.innovations);
  assert.equal(JSON.stringify(child), before);
}

function testDisabledGenesDoNotAffectForwardPass() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const inputs = Array.from({ length: 15 }, (_, index) => index / 15);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.genome.connections.push({
    innovationId: connectionInnovationId({ kind: "input", index: 0 }, { kind: "hidden", unitId: unit.unitId, gate: "candidate" }),
    source: { kind: "input", index: 0 },
    target: { kind: "hidden", unitId: unit.unitId, gate: "candidate" },
    weight: 1_000_000,
    enabled: false,
  });
  const clone = createSpawnerWorld(505, { initialSpawners: 1 }).spawners[0];
  assert(clone);
  const after = forwardSpawner(spawner, inputs).map(round);
  const expected = forwardSpawner(clone, inputs).map(round);
  assert.deepEqual(after, expected);
}

export const tests: SineTest[] = [
  { name: "Hidden State Alignment For Reenabled Units", run: testHiddenStateAlignmentForReenabledUnits },
  { name: "Deeper Layer Uses Lower Layer Current State", run: testDeeperLayerUsesLowerLayerCurrentState },
  { name: "Sparse Founder Topology Guarantees", run: testSparseFounderTopologyGuarantees },
  { name: "Zero Mutation Leaves Genome Unchanged", run: testZeroMutationLeavesGenomeUnchanged },
  { name: "Disabled Genes Do Not Affect Forward Pass", run: testDisabledGenesDoNotAffectForwardPass },
];
