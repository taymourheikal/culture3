import { INPUT_COUNT } from "./config";
import { SPAWNER_INPUT_METADATA_TEXT, type SpawnerInputCategory } from "../inputMetadataText";

export type { SpawnerInputCategory };

export type SpawnerInputMetadata = {
  index: number;
  label: string;
  shortLabel: string;
  category: SpawnerInputCategory;
  derived: boolean;
  description: string;
};

export const SPAWNER_INPUT_VERSION = "volume-rsi-v1";

export const SPAWNER_INPUT_METADATA: SpawnerInputMetadata[] = SPAWNER_INPUT_METADATA_TEXT.map((input) => ({
  ...input,
  derived: true,
}));

export const INPUT_LABELS = SPAWNER_INPUT_METADATA.map((input) => input.label);

if (SPAWNER_INPUT_METADATA.length !== INPUT_COUNT) {
  throw new Error(`Expected ${INPUT_COUNT} spawner input labels, got ${SPAWNER_INPUT_METADATA.length}.`);
}
