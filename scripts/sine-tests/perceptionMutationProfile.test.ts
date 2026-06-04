import { strict as assert } from "node:assert";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawner/config";
import {
  defaultMutationProfileFromConfig,
  driftMutationProfile,
  mutationProfileDetailGroups,
  sanitizeMutationProfile,
  summarizeMutationProfile,
} from "../../src/sine/spawner/mutationProfile";
import { defaultPayoffProfileFromConfig, mutatePayoffProfile, sanitizePayoffProfile } from "../../src/sine/spawner/payoffProfile";
import {
  defaultPerceptionFromConfig,
  mutatePerception,
  perceptionCacheKey,
  perceptionDetailRows,
  PERCEPTION_MAX_TICKS,
  randomizeFounderPerception,
  rollingLags,
  sanitizePerception,
  summarizePerception,
} from "../../src/sine/spawner/perception";
import { defaultTradingPolicyFromConfig, mutateTradingPolicy, sanitizeTradingPolicy } from "../../src/sine/spawner/tradingPolicy";
import { SeededRng } from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

function testPerceptionDefaultsAndSanitization() {
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.equal(perception.deltaLagPairs.length, 5);
  assert.deepEqual(perception.deltaLagPairs[4], { fromTicks: 27, toTicks: 53 });
  assert.deepEqual(rollingLags(perception), [0, 9, 18, 27, 35, 44, 53]);
  assert.equal(perception.volumeScaleWindowTicks, 53);
  assert.equal(perception.volumeScaleSampleStepTicks, 3);
  assert.equal(perception.volumeDeltaLagTicks, 7);
  assert.equal(perception.volumeAccelerationLagTicks, 7);
  assert.equal(perception.rsiWindowTicks, 14);
  assert.equal(perception.volumePriceAgreementLagTicks, 7);

  const sanitized = sanitizePerception({
    deltaLagPairs: [{ fromTicks: -10, toTicks: 2000 }],
    localScaleSampleStepTicks: 0,
    volumeScaleSampleStepTicks: 0,
    rsiWindowTicks: 0,
    pendingDensityScale: -3,
  });
  assert.equal(sanitized.deltaLagPairs[0]?.fromTicks, 0);
  assert.equal(sanitized.deltaLagPairs[0]?.toTicks, PERCEPTION_MAX_TICKS);
  assert.equal(sanitized.localScaleSampleStepTicks, 1);
  assert.equal(sanitized.volumeScaleSampleStepTicks, 1);
  assert.equal(sanitized.rsiWindowTicks, 1);
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
  assert(mutated.volumeScaleSampleStepTicks >= 1);
  assert(mutated.rsiWindowTicks >= 1);
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
    volumeScaleWindowTicks: Infinity,
    volumeScaleSampleStepTicks: -10,
    volumeDeltaLagTicks: 2000,
    volumeAccelerationLagTicks: -10,
    rsiWindowTicks: 0,
    volumePriceAgreementLagTicks: 12.4,
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
  assert.equal(perception.volumeScaleWindowTicks, 53);
  assert.equal(perception.volumeScaleSampleStepTicks, 1);
  assert.equal(perception.volumeDeltaLagTicks, PERCEPTION_MAX_TICKS);
  assert.equal(perception.volumeAccelerationLagTicks, 0);
  assert.equal(perception.rsiWindowTicks, 1);
  assert.equal(perception.volumePriceAgreementLagTicks, 12);
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
  assert.ok(perceptionRows.some((row) => row.label === "Volume scale window" && row.value.includes("53")));
  assert.ok(perceptionRows.some((row) => row.label === "RSI window" && row.value.includes("14")));
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

function testPerceptionGoldenDescriptorBehavior() {
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.equal(perceptionCacheKey(perception), "0|3|3|7|7|13|13|27|27|53|53|53|3|53|3|7|7|14|7|53|53|0.02|80");
  assert.deepEqual(summarizePerception(perception), {
    averageLag: 15.3,
    longestWindow: 53,
    pendingDensityScale: 80,
  });
  assert.deepEqual(perceptionDetailRows(perception), [
    { label: "Delta pair 1", value: "0-3 ticks" },
    { label: "Delta pair 2", value: "3-7 ticks" },
    { label: "Delta pair 3", value: "7-13 ticks" },
    { label: "Delta pair 4", value: "13-27 ticks" },
    { label: "Delta pair 5", value: "27-53 ticks" },
    { label: "Rolling window", value: "53 ticks" },
    { label: "Local scale window", value: "53 ticks" },
    { label: "Local sample step", value: "3 ticks" },
    { label: "Volume scale window", value: "53 ticks" },
    { label: "Volume sample step", value: "3 ticks" },
    { label: "Volume delta lag", value: "7 ticks" },
    { label: "Volume acceleration lag", value: "7 ticks" },
    { label: "RSI window", value: "14 ticks" },
    { label: "Volume-price agreement lag", value: "7 ticks" },
    { label: "Trend window", value: "53 ticks" },
    { label: "Cycle window", value: "53 ticks" },
    { label: "Roughness sensitivity", value: "0.0200" },
    { label: "Pending density scale", value: "80 ticks" },
  ]);
  assert.deepEqual(
    mutatePerception(perception, new SeededRng(42), {
      rate: 1,
      lagStdDev: 3,
      windowStdDev: 5,
      sensitivityStdDev: 0.001,
      densityScaleStdDev: 6,
    }),
    {
      deltaLagPairs: [
        { fromTicks: 2, toTicks: 0 },
        { fromTicks: 5, toTicks: 11 },
        { fromTicks: 9, toTicks: 11 },
        { fromTicks: 15, toTicks: 30 },
        { fromTicks: 30, toTicks: 56 },
      ],
      rollingWindowTicks: 50,
      localScaleWindowTicks: 46,
      localScaleSampleStepTicks: 1,
      volumeScaleWindowTicks: 48,
      volumeScaleSampleStepTicks: 2,
      volumeDeltaLagTicks: 8,
      volumeAccelerationLagTicks: 11,
      rsiWindowTicks: 12,
      volumePriceAgreementLagTicks: 13,
      trendWindowTicks: 54,
      cycleWindowTicks: 44,
      roughnessSensitivity: 0.02080020451837081,
      pendingDensityScale: 84,
    },
  );
}

function testMutationProfileGoldenDescriptorBehavior() {
  const profile = defaultMutationProfileFromConfig(DEFAULT_SPAWNER_CONFIG);
  assert.deepEqual(summarizeMutationProfile(profile), {
    topologyRate: 0.020166666666666663,
    weightActivity: 0.036899999999999995,
    biasActivity: 0.0245,
    perceptionMutationRate: 0.08,
    payoffScaleMutationRate: 0.08,
    tradingPolicyMutationRate: 0.08,
    mutationProfileMutationStdDev: 0.006,
  });
  assert.deepEqual(mutationProfileDetailGroups(profile).map((group) => [group.title, group.rows.map((row) => [row.label, row.value])]), [
    ["Topology Mutation", [
      ["Add unit rate", "0.015"],
      ["Disable unit rate", "0.006"],
      ["Re-enable unit rate", "0.003"],
      ["Add connection rate", "0.060"],
      ["Disable connection rate", "0.025"],
      ["Re-enable connection rate", "0.012"],
    ]],
    ["Weight And Bias Mutation", [
      ["Weight mutation rate", "0.820"],
      ["Weight mutation stddev", "0.045"],
      ["Weight replace rate", "0.015"],
      ["New connection stddev", "0.450"],
      ["Gate bias rate", "0.700"],
      ["Gate bias stddev", "0.035"],
      ["Output bias rate", "0.700"],
      ["Output bias stddev", "0.035"],
    ]],
    ["Perception Mutation", [
      ["Perception mutation rate", "0.080"],
      ["Lag mutation stddev", "2.000 ticks"],
      ["Window mutation stddev", "4.000 ticks"],
      ["Roughness mutation stddev", "0.0020"],
      ["Density-scale mutation stddev", "4.000 ticks"],
    ]],
    ["Payoff Scale Mutation", [
      ["Payoff scale mutation rate", "0.080"],
      ["Payoff window stddev", "4.000 ticks"],
      ["Payoff sample-step stddev", "4.000 ticks"],
    ]],
    ["Trading Policy Mutation", [
      ["Trading policy mutation rate", "0.080"],
      ["Spawn-threshold stddev", "0.025"],
      ["Min-strength stddev", "0.025"],
    ]],
    ["Control Mutation", [
      ["Threshold-bias stddev", "0.015"],
      ["Min horizon stddev", "0.670 ticks"],
      ["Max horizon stddev", "1.560 ticks"],
      ["Cooldown stddev", "0.440 ticks"],
      ["Profile drift stddev", "0.006"],
    ]],
  ]);
  assert.deepEqual(driftMutationProfile({ ...profile, mutationProfileMutationStdDev: 0.01 }, new SeededRng(42)), {
    addUnitRate: 0.00543837770615851,
    disableUnitRate: 0.003269738951173896,
    reenableUnitRate: 0,
    addConnectionRate: 0.04859117929045976,
    disableConnectionRate: 0.019705662062835846,
    reenableConnectionRate: 0.024285906730631045,
    weightMutationRate: 0.8173148227337275,
    weightMutationStdDev: 0.026982065823129092,
    weightReplaceRate: 0.008340008517429387,
    newConnectionWeightStdDev: 0.41720922866664584,
    gateBiasMutationRate: 0.7056528686107079,
    gateBiasMutationStdDev: 0.0450339934874001,
    outputBiasMutationRate: 0.7150430117719313,
    outputBiasMutationStdDev: 0.03883938506120122,
    perceptionMutationRate: 0.09109956717234255,
    perceptionLagMutationStdDev: 2.010302777734465,
    perceptionWindowMutationStdDev: 4.004342793464747,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 4.024307381586462,
    payoffScaleMutationRate: 0.07111345678741207,
    payoffScaleWindowMutationStdDev: 3.989780842560921,
    payoffScaleSampleStepMutationStdDev: 3.994154433600352,
    tradingPolicyMutationRate: 0.08491310202605122,
    spawnThresholdMutationStdDev: 0.028303888497137008,
    minSignalStrengthMutationStdDev: 0.020767141195883253,
    thresholdBiasMutationStdDev: 0.002777621154373286,
    minHorizonTicksMutationStdDev: 0.666930490301271,
    maxHorizonTicksMutationStdDev: 1.5632940116043035,
    cooldownBaseTicksMutationStdDev: 0.4369103947977066,
    mutationProfileMutationStdDev: 0.012242499978731523,
  });
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
  { name: "Perception Golden Descriptor Behavior", run: testPerceptionGoldenDescriptorBehavior },
  { name: "Mutation Profile Golden Descriptor Behavior", run: testMutationProfileGoldenDescriptorBehavior },
];
