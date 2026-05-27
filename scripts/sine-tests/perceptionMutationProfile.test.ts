import { strict as assert } from "node:assert";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawner/config";
import { defaultMutationProfileFromConfig, driftMutationProfile, mutationProfileDetailGroups, sanitizeMutationProfile } from "../../src/sine/spawner/mutationProfile";
import { defaultPayoffProfileFromConfig, mutatePayoffProfile, sanitizePayoffProfile } from "../../src/sine/spawner/payoffProfile";
import {
  defaultPerceptionFromConfig,
  mutatePerception,
  perceptionDetailRows,
  PERCEPTION_MAX_TICKS,
  randomizeFounderPerception,
  rollingLags,
  sanitizePerception,
} from "../../src/sine/spawner/perception";
import { defaultTradingPolicyFromConfig, mutateTradingPolicy, sanitizeTradingPolicy } from "../../src/sine/spawner/tradingPolicy";
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

function testPayoffProfileDefaultsSanitizationAndMutation() {
  const profile = defaultPayoffProfileFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.equal(profile.scaleWindowTicks, DEFAULT_SPAWNER_CONFIG.defaultPayoffScaleWindowTicks);
  assert.equal(profile.scaleSampleStepTicks, DEFAULT_SPAWNER_CONFIG.defaultPayoffScaleSampleStepTicks);

  const sanitized = sanitizePayoffProfile({ scaleWindowTicks: Number.NaN, scaleSampleStepTicks: -10 });
  assert.equal(sanitized.scaleWindowTicks, 53);
  assert.equal(sanitized.scaleSampleStepTicks, 1);

  const unchanged = mutatePayoffProfile(profile, new SeededRng(1), { rate: 0, windowStdDev: 100, sampleStepStdDev: 100 });
  assert.deepEqual(unchanged, profile);

  const mutated = mutatePayoffProfile(profile, new SeededRng(2), { rate: 1, windowStdDev: 400, sampleStepStdDev: 400 });
  assert(mutated.scaleWindowTicks >= 0);
  assert(mutated.scaleSampleStepTicks >= 1);
}

function testTradingPolicyDefaultsSanitizationAndMutation() {
  const policy = defaultTradingPolicyFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.equal(policy.spawnThreshold, DEFAULT_SPAWNER_CONFIG.defaultSpawnThreshold);
  assert.equal(policy.minSignalStrength, DEFAULT_SPAWNER_CONFIG.defaultMinSignalStrength);

  const sanitized = sanitizeTradingPolicy({ spawnThreshold: Number.NaN, minSignalStrength: 2 });
  assert.equal(sanitized.spawnThreshold, 0.56);
  assert.equal(sanitized.minSignalStrength, 1);

  const unchanged = mutateTradingPolicy(policy, new SeededRng(1), {
    rate: 0,
    spawnThresholdStdDev: 1,
    minSignalStrengthStdDev: 1,
  });
  assert.deepEqual(unchanged, policy);

  const mutated = mutateTradingPolicy(policy, new SeededRng(2), {
    rate: 1,
    spawnThresholdStdDev: 1,
    minSignalStrengthStdDev: 1,
  });
  assert(mutated.spawnThreshold >= 0 && mutated.spawnThreshold <= 1.5);
  assert(mutated.minSignalStrength >= 0 && mutated.minSignalStrength <= 1);
  assert.notDeepEqual(mutated, policy);
}

function testSanitizationHandlesUnsafeNumericValues() {
  const perception = sanitizePerception({
    deltaLagPairs: [
      { fromTicks: Number.NaN, toTicks: Infinity },
      { fromTicks: -2.4, toTicks: 12.6 },
      { fromTicks: 2000, toTicks: -Infinity },
    ],
    rollingWindowTicks: undefined,
    localScaleWindowTicks: Number.NaN,
    localScaleSampleStepTicks: -10,
    trendWindowTicks: 12.4,
    cycleWindowTicks: 1500,
    roughnessSensitivity: -0.5,
    pendingDensityScale: Infinity,
  });
  assert.deepEqual(perception.deltaLagPairs[0], { fromTicks: 0, toTicks: 3 });
  assert.deepEqual(perception.deltaLagPairs[1], { fromTicks: 0, toTicks: 13 });
  assert.deepEqual(perception.deltaLagPairs[2], { fromTicks: PERCEPTION_MAX_TICKS, toTicks: 13 });
  assert.equal(perception.rollingWindowTicks, 53);
  assert.equal(perception.localScaleWindowTicks, 53);
  assert.equal(perception.localScaleSampleStepTicks, 1);
  assert.equal(perception.trendWindowTicks, 12);
  assert.equal(perception.cycleWindowTicks, PERCEPTION_MAX_TICKS);
  assert.equal(perception.roughnessSensitivity, 0);
  assert.equal(perception.pendingDensityScale, 80);

  const profile = sanitizeMutationProfile({
    addUnitRate: Number.NaN,
    disableUnitRate: Infinity,
    reenableUnitRate: -1,
    weightMutationRate: 2,
    weightMutationStdDev: Infinity,
    gateBiasMutationStdDev: -0.2,
    outputBiasMutationStdDev: 2.25,
  });
  assert.equal(profile.addUnitRate, 0.015);
  assert.equal(profile.disableUnitRate, 0.006);
  assert.equal(profile.reenableUnitRate, 0);
  assert.equal(profile.weightMutationRate, 1);
  assert.equal(profile.weightMutationStdDev, 0.045);
  assert.equal(profile.gateBiasMutationStdDev, 0);
  assert.equal(profile.outputBiasMutationStdDev, 2.25);
}

function testPerceptionAndMutationDetailRowsUseExpressedValues() {
  const perceptionRows = perceptionDetailRows(defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG));
  const mutationGroups = mutationProfileDetailGroups(defaultMutationProfileFromConfig(DEFAULT_SPAWNER_CONFIG));
  const mutationRows = mutationGroups.flatMap((group) => group.rows);

  assert.ok(perceptionRows.some((row) => row.label === "Delta pair 5" && row.value.includes("27-53")));
  assert.ok(perceptionRows.some((row) => row.label === "Pending density scale" && row.value.includes("ticks")));
  assert.ok(mutationGroups.some((group) => group.title === "Perception Mutation"));
  assert.ok(mutationGroups.some((group) => group.title === "Payoff Scale Mutation"));
  assert.ok(mutationGroups.some((group) => group.title === "Trading Policy Mutation"));
  assert.ok(mutationRows.some((row) => row.label === "Perception mutation rate"));
  assert.ok(mutationRows.some((row) => row.label === "Payoff scale mutation rate"));
  assert.ok(mutationRows.some((row) => row.label === "Trading policy mutation rate"));
  assert.ok(mutationRows.some((row) => row.label === "Profile drift stddev"));
  assert.equal(mutationRows.some((row) => row.label.includes("mutationStd")), false);
}

export const tests: SineTest[] = [
  { name: "Perception Defaults And Sanitization", run: testPerceptionDefaultsAndSanitization },
  { name: "Founder Perception Randomization Breadth", run: testFounderPerceptionRandomizationBreadth },
  { name: "Perception Mutation Stays In Safe Range", run: testPerceptionMutationStaysInSafeRange },
  { name: "Mutation Profile Defaults And Drift Stay Valid", run: testMutationProfileDefaultsAndDriftStayValid },
  { name: "Payoff Profile Defaults Sanitization And Mutation", run: testPayoffProfileDefaultsSanitizationAndMutation },
  { name: "Trading Policy Defaults Sanitization And Mutation", run: testTradingPolicyDefaultsSanitizationAndMutation },
  { name: "Sanitization Handles Unsafe Numeric Values", run: testSanitizationHandlesUnsafeNumericValues },
  { name: "Perception And Mutation Detail Rows Use Expressed Values", run: testPerceptionAndMutationDetailRowsUseExpressedValues },
];
