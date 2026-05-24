import { strict as assert } from "node:assert";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawner/config";
import { defaultMutationProfileFromConfig, driftMutationProfile, mutationProfileDetailGroups, sanitizeMutationProfile } from "../../src/sine/spawner/mutationProfile";
import {
  defaultPerceptionFromConfig,
  mutatePerception,
  perceptionDetailRows,
  PERCEPTION_MAX_TICKS,
  randomizeFounderPerception,
  rollingLags,
  sanitizePerception,
} from "../../src/sine/spawner/perception";
import { SeededRng } from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

function testPerceptionDefaultsAndSanitization() {
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.equal(perception.deltaLagPairs.length, 5);
  assert.deepEqual(perception.deltaLagPairs[4], { fromTicks: 27, toTicks: 53 });
  assert.deepEqual(rollingLags(perception), [0, 9, 18, 27, 35, 44, 53]);

  const sanitized = sanitizePerception({
    deltaLagPairs: [{ fromTicks: -10, toTicks: 2000 }],
    localScaleSampleStepTicks: 0,
    pendingDensityScale: -3,
  });
  assert.equal(sanitized.deltaLagPairs[0]?.fromTicks, 0);
  assert.equal(sanitized.deltaLagPairs[0]?.toTicks, PERCEPTION_MAX_TICKS);
  assert.equal(sanitized.localScaleSampleStepTicks, 1);
  assert.equal(sanitized.pendingDensityScale, 1);
}

function testFounderPerceptionRandomizationBreadth() {
  const fixed = randomizeFounderPerception({ ...DEFAULT_SPAWNER_CONFIG, founderPerceptionRandomizationTicks: 0 }, new SeededRng(1));
  assert.deepEqual(fixed, defaultPerceptionFromConfig({ ...DEFAULT_SPAWNER_CONFIG, founderPerceptionRandomizationTicks: 0 }));

  const randomized = randomizeFounderPerception({ ...DEFAULT_SPAWNER_CONFIG, founderPerceptionRandomizationTicks: 20 }, new SeededRng(1));
  assert.notDeepEqual(randomized, defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG));
  assert(randomized.deltaLagPairs.every((pair) => pair.fromTicks >= 0 && pair.toTicks <= PERCEPTION_MAX_TICKS));
}

function testPerceptionMutationStaysInSafeRange() {
  const original = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const mutated = mutatePerception(original, new SeededRng(2), {
    rate: 1,
    lagStdDev: 400,
    windowStdDev: 400,
    sensitivityStdDev: 0.5,
    densityScaleStdDev: 400,
  });
  assert.equal(mutated.deltaLagPairs.length, 5);
  assert(mutated.deltaLagPairs.every((pair) => pair.fromTicks >= 0 && pair.fromTicks <= PERCEPTION_MAX_TICKS));
  assert(mutated.deltaLagPairs.every((pair) => pair.toTicks >= 0 && pair.toTicks <= PERCEPTION_MAX_TICKS));
  assert(mutated.localScaleSampleStepTicks >= 1);
  assert(mutated.pendingDensityScale >= 1);
}

function testMutationProfileDefaultsAndDriftStayValid() {
  const profile = defaultMutationProfileFromConfig(DEFAULT_SPAWNER_CONFIG);
  const drifted = driftMutationProfile({ ...profile, mutationProfileMutationStdDev: 0.5 }, new SeededRng(3));
  for (const [key, value] of Object.entries(drifted)) {
    assert(Number.isFinite(value), `${key} should stay finite`);
    if (key.endsWith("Rate")) assert(value >= 0 && value <= 1, `${key} should stay in [0, 1]`);
    if (key.endsWith("StdDev")) assert(value >= 0, `${key} should stay non-negative`);
  }

  const sanitized = sanitizeMutationProfile({ addUnitRate: 2, weightMutationStdDev: -1, mutationProfileMutationStdDev: Number.NaN });
  assert.equal(sanitized.addUnitRate, 1);
  assert.equal(sanitized.weightMutationStdDev, 0);
  assert.equal(sanitized.mutationProfileMutationStdDev, 0.006);
}

function testPerceptionAndMutationDetailRowsUseExpressedValues() {
  const perceptionRows = perceptionDetailRows(defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG));
  const mutationGroups = mutationProfileDetailGroups(defaultMutationProfileFromConfig(DEFAULT_SPAWNER_CONFIG));
  const mutationRows = mutationGroups.flatMap((group) => group.rows);

  assert.ok(perceptionRows.some((row) => row.label === "Delta pair 5" && row.value.includes("27-53")));
  assert.ok(perceptionRows.some((row) => row.label === "Pending density scale" && row.value.includes("ticks")));
  assert.ok(mutationGroups.some((group) => group.title === "Perception Mutation"));
  assert.ok(mutationRows.some((row) => row.label === "Perception mutation rate"));
  assert.ok(mutationRows.some((row) => row.label === "Profile drift stddev"));
  assert.equal(mutationRows.some((row) => row.label.includes("mutationStd")), false);
}

export const tests: SineTest[] = [
  { name: "Perception Defaults And Sanitization", run: testPerceptionDefaultsAndSanitization },
  { name: "Founder Perception Randomization Breadth", run: testFounderPerceptionRandomizationBreadth },
  { name: "Perception Mutation Stays In Safe Range", run: testPerceptionMutationStaysInSafeRange },
  { name: "Mutation Profile Defaults And Drift Stay Valid", run: testMutationProfileDefaultsAndDriftStayValid },
  { name: "Perception And Mutation Detail Rows Use Expressed Values", run: testPerceptionAndMutationDetailRowsUseExpressedValues },
];
