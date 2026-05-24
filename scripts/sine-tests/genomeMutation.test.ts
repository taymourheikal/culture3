import { strict as assert } from "node:assert";
import { activeConnections, activeLayerIndexes, activeUnits, addRandomLegalConnection, alignHiddenState, architectureMetrics, connectionInnovationId, createSpawnerWorld, forwardSpawner, getOrCreateConnectionInnovationId, isLegalConnection, mutateGenome, OUTPUT_COUNT, SeededRng, validateGenome } from "../../src/sine/spawnerSimulation";
import { round, runTo, type SineTest } from "./helpers";

function testAddUnitMutationWiresNewUnit() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    newUnitInitialConnections: 12,
    addUnitRate: 1,
    addConnectionRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  let isolated = 0;
  let sawInputToNewUnit = false;
  let sawHiddenToNewUnit = false;
  let sawNewUnitToOutput = false;
  for (let seed = 1; seed <= 200; seed += 1) {
    const child = mutateGenome(parent.genome, new SeededRng(seed), world.config, world.innovations);
    const newestUnitId = Math.max(...child.units.map((unit) => unit.unitId));
    const touchingConnections = activeConnections(child).filter(
      (connection) =>
        (connection.source.kind === "hidden" && connection.source.unitId === newestUnitId) ||
        (connection.target.kind === "hidden" && connection.target.unitId === newestUnitId),
    );
    if (touchingConnections.length === 0) isolated += 1;
    sawInputToNewUnit ||= touchingConnections.some((connection) => connection.source.kind === "input" && connection.target.kind === "hidden");
    sawHiddenToNewUnit ||= touchingConnections.some(
      (connection) => connection.source.kind === "hidden" && connection.target.kind === "hidden" && connection.target.unitId === newestUnitId,
    );
    sawNewUnitToOutput ||= touchingConnections.some(
      (connection) => connection.source.kind === "hidden" && connection.source.unitId === newestUnitId && connection.target.kind === "output",
    );
  }
  assert.equal(isolated, 0);
  assert.equal(sawInputToNewUnit, true);
  assert.equal(sawHiddenToNewUnit, true);
  assert.equal(sawNewUnitToOutput, true);
}

function testDisableLastActiveUnitIsPrevented() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    addUnitRate: 0,
    disableUnitRate: 1,
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
  });
  const parent = world.spawners[0];
  assert(parent);
  const child = mutateGenome(parent.genome, new SeededRng(1), world.config, world.innovations);
  assert.equal(activeUnits(child).length, 1);

  const multiWorld = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    addUnitRate: 0,
    disableUnitRate: 1,
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
  });
  const multiParent = multiWorld.spawners[0];
  assert(multiParent);
  const multiChild = mutateGenome(multiParent.genome, new SeededRng(1), multiWorld.config, multiWorld.innovations);
  assert.equal(activeUnits(multiChild).length, 1);
}

function testAddUnitAfterAllDisabledStartsAtLayerOne() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    newUnitInitialConnections: 1,
    addUnitRate: 1,
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
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.units.forEach((unit) => {
    unit.enabled = false;
  });
  const child = mutateGenome(parent.genome, new SeededRng(1), world.config, world.innovations);
  assert.deepEqual(activeLayerIndexes(child), [1]);
}

function testGenomeValidationCatchesInvalidTopology() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  assert.equal(validateGenome(spawner.genome, world.config).valid, true);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  const invalid = {
    ...spawner.genome,
    connections: [
      ...spawner.genome.connections,
      {
        innovationId: 123456,
        source: { kind: "hidden" as const, unitId: unit.unitId, mode: "previous" as const },
        target: { kind: "output" as const, index: 0 },
        weight: 1,
        enabled: true,
      },
    ],
  };
  const result = validateGenome(invalid, world.config);
  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Illegal enabled connection")));

  const invalidOutput = {
    ...spawner.genome,
    connections: [
      ...spawner.genome.connections,
      {
        innovationId: 123457,
        source: { kind: "hidden" as const, unitId: unit.unitId, mode: "current" as const },
        target: { kind: "output" as const, index: OUTPUT_COUNT },
        weight: 1,
        enabled: true,
      },
    ],
  };
  const outputResult = validateGenome(invalidOutput, world.config);
  assert.equal(outputResult.valid, false);
  assert(outputResult.errors.some((error) => error.includes("Illegal enabled connection")));
}

function testGenomeValidationCatchesInvalidPerceptionAndMutationProfile() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);

  const invalidPerception = {
    ...spawner.genome,
    perception: {
      ...spawner.genome.perception,
      deltaLagPairs: [{ fromTicks: Number.NaN, toTicks: 2001 }],
      localScaleSampleStepTicks: 0,
      roughnessSensitivity: -1,
      pendingDensityScale: Number.NaN,
    },
  };
  const perceptionResult = validateGenome(invalidPerception, world.config);
  assert.equal(perceptionResult.valid, false);
  assert(perceptionResult.errors.some((error) => error.includes("Expected 5 perception lag pairs")));
  assert(perceptionResult.errors.some((error) => error.includes("fromTicks")));
  assert(perceptionResult.errors.some((error) => error.includes("local scale sample step")));
  assert(perceptionResult.errors.some((error) => error.includes("roughness sensitivity")));

  const invalidProfile = {
    ...spawner.genome,
    mutationProfile: {
      ...spawner.genome.mutationProfile,
      addUnitRate: 2,
      weightMutationStdDev: -0.1,
      mutationProfileMutationStdDev: Number.NaN,
    },
  };
  const profileResult = validateGenome(invalidProfile, world.config);
  assert.equal(profileResult.valid, false);
  assert(profileResult.errors.some((error) => error.includes("addUnitRate")));
  assert(profileResult.errors.some((error) => error.includes("weightMutationStdDev")));
  assert(profileResult.errors.some((error) => error.includes("mutationProfileMutationStdDev")));
}

export const tests: SineTest[] = [
  { name: "Add Unit Mutation Wires New Unit", run: testAddUnitMutationWiresNewUnit },
  { name: "Disable Last Active Unit Is Prevented", run: testDisableLastActiveUnitIsPrevented },
  { name: "Add Unit After All Disabled Starts At Layer One", run: testAddUnitAfterAllDisabledStartsAtLayerOne },
  { name: "Genome Validation Catches Invalid Topology", run: testGenomeValidationCatchesInvalidTopology },
  { name: "Genome Validation Catches Invalid Perception And Mutation Profile", run: testGenomeValidationCatchesInvalidPerceptionAndMutationProfile },
];
