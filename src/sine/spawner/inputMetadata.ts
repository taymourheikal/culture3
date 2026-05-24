import { INPUT_COUNT } from "./config";

export type SpawnerInputCategory = "market-derived" | "context-derived" | "agent-state";

export type SpawnerInputMetadata = {
  index: number;
  label: string;
  shortLabel: string;
  category: SpawnerInputCategory;
  derived: boolean;
  description: string;
};

export const SPAWNER_INPUT_VERSION = "mutable-perception-v1";

export const SPAWNER_INPUT_METADATA: SpawnerInputMetadata[] = [
  input(0, "Relative ROC", "Rel. ROC", "market-derived", "Current observed ROC divided by the agent's recent local scale."),
  input(
    1,
    "Relative ROC delta pair 1",
    "ROC delta 1",
    "market-derived",
    "Difference between the agent's first mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  input(
    2,
    "Relative ROC delta pair 2",
    "ROC delta 2",
    "market-derived",
    "Difference between the agent's second mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  input(
    3,
    "Relative ROC delta pair 3",
    "ROC delta 3",
    "market-derived",
    "Difference between the agent's third mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  input(
    4,
    "Relative ROC delta pair 4",
    "ROC delta 4",
    "market-derived",
    "Difference between the agent's fourth mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  input(
    5,
    "Relative ROC delta pair 5",
    "ROC delta 5",
    "market-derived",
    "Difference between the agent's fifth mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  input(
    6,
    "Relative mean ROC",
    "Rel. mean",
    "market-derived",
    "Average ROC across the agent's mutable rolling window, divided by recent local scale.",
  ),
  input(
    7,
    "Relative rolling volatility",
    "Rel. vol",
    "market-derived",
    "Standard deviation of ROC across the agent's mutable rolling window, divided by recent local scale.",
  ),
  input(
    8,
    "Position in local range",
    "Range pos",
    "market-derived",
    "Current ROC position between the low and high of the agent's mutable local-scale window.",
  ),
  input(
    9,
    "Relative trend slope",
    "Rel. trend",
    "market-derived",
    "Linear-regression slope over the agent's mutable trend window, scaled by recent local scale.",
  ),
  input(
    10,
    "Relative residual volatility",
    "Rel. residual vol",
    "market-derived",
    "Volatility left after subtracting the estimated local trend line, divided by recent local scale.",
  ),
  input(
    11,
    "Relative roughness",
    "Rel. roughness",
    "market-derived",
    "Local jaggedness estimated from scale-normalized curvature and turning-point rate using the agent's mutable roughness sensitivity.",
  ),
  input(
    12,
    "Relative cycle rate",
    "Rel. cycle",
    "market-derived",
    "Estimated turning-point cycle rate over the agent's mutable cycle window.",
  ),
  input(
    13,
    "Pending density",
    "Pending density",
    "context-derived",
    "Open opportunity count divided by the agent's mutable pending-density scale.",
  ),
  input(14, "Energy ratio", "Energy ratio", "agent-state", "Agent energy divided by reproduction energy."),
  input(15, "Health ratio", "Health ratio", "agent-state", "Agent health divided by 100."),
];

export const INPUT_LABELS = SPAWNER_INPUT_METADATA.map((input) => input.label);

if (SPAWNER_INPUT_METADATA.length !== INPUT_COUNT) {
  throw new Error(`Expected ${INPUT_COUNT} spawner input labels, got ${SPAWNER_INPUT_METADATA.length}.`);
}

function input(index: number, label: string, shortLabel: string, category: SpawnerInputCategory, description: string): SpawnerInputMetadata {
  return {
    index,
    label,
    shortLabel,
    category,
    derived: true,
    description,
  };
}
