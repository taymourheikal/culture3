import { strict as assert } from "node:assert";
import { INPUT_COUNT } from "../../src/sine/spawner/config";
import { INPUT_LABELS, SPAWNER_INPUT_METADATA, SPAWNER_INPUT_VERSION } from "../../src/sine/spawner/inputMetadata";
import type { SineTest } from "./helpers";

function testInputMetadataMatchesInputContract() {
  assert.equal(SPAWNER_INPUT_VERSION, "mutable-perception-v1");
  assert.equal(SPAWNER_INPUT_METADATA.length, INPUT_COUNT);
  assert.equal(INPUT_COUNT, 16);
  assert.equal(INPUT_LABELS.length, INPUT_COUNT);
  assert.deepEqual(
    SPAWNER_INPUT_METADATA.map((input) => input.index),
    Array.from({ length: INPUT_COUNT }, (_, index) => index),
  );
}

function testInputMetadataUsesTickNativeLabels() {
  const metadataText = SPAWNER_INPUT_METADATA
    .map((input) => `${input.label} ${input.shortLabel} ${input.description}`)
    .join(" ");

  assert.equal(/ROC delta [0-9.]+s/.test(metadataText), false);
  assert.equal(/\b0\.6s\b|\b1\.2s\b|\b2\.4s\b|\b4\.8s\b/.test(metadataText), false);
  assert.equal(/\bEstimated amplitude\b/.test(metadataText), false);
}

function testInputMetadataDescribesMutablePerception() {
  assert.equal(INPUT_LABELS[0], "Relative ROC");
  assert.equal(INPUT_LABELS[1], "Relative ROC delta pair 1");
  assert.equal(INPUT_LABELS[5], "Relative ROC delta pair 5");
  assert.equal(INPUT_LABELS[8], "Position in local range");
  assert.equal(INPUT_LABELS[12], "Relative cycle rate");
  assert.equal(INPUT_LABELS[15], "Health ratio");
  assert(SPAWNER_INPUT_METADATA.slice(1, 14).some((input) => input.description.toLowerCase().includes("mutable")));
}

export const tests: SineTest[] = [
  { name: "Input Metadata Matches Input Contract", run: testInputMetadataMatchesInputContract },
  { name: "Input Metadata Uses Tick Native Labels", run: testInputMetadataUsesTickNativeLabels },
  { name: "Input Metadata Describes Mutable Perception", run: testInputMetadataDescribesMutablePerception },
];
