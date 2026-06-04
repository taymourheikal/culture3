export type SpawnerInputCategory = "market-derived" | "context-derived" | "agent-state";

export type SpawnerInputMetadataText = {
  index: number;
  label: string;
  shortLabel: string;
  category: SpawnerInputCategory;
  description: string;
};

export const SPAWNER_INPUT_METADATA_TEXT: SpawnerInputMetadataText[] = [
  inputText(0, "Relative ROC", "Rel. ROC", "market-derived", "Current observed ROC divided by the agent's recent local scale."),
  inputText(
    1,
    "Relative ROC delta pair 1",
    "ROC delta 1",
    "market-derived",
    "Difference between the agent's first mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  inputText(
    2,
    "Relative ROC delta pair 2",
    "ROC delta 2",
    "market-derived",
    "Difference between the agent's second mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  inputText(
    3,
    "Relative ROC delta pair 3",
    "ROC delta 3",
    "market-derived",
    "Difference between the agent's third mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  inputText(
    4,
    "Relative ROC delta pair 4",
    "ROC delta 4",
    "market-derived",
    "Difference between the agent's fourth mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  inputText(
    5,
    "Relative ROC delta pair 5",
    "ROC delta 5",
    "market-derived",
    "Difference between the agent's fifth mutable pair of lagged ROC samples, divided by its recent local scale.",
  ),
  inputText(
    6,
    "Relative mean ROC",
    "Rel. mean",
    "market-derived",
    "Average ROC across the agent's mutable rolling window, divided by recent local scale.",
  ),
  inputText(
    7,
    "Relative rolling volatility",
    "Rel. vol",
    "market-derived",
    "Standard deviation of ROC across the agent's mutable rolling window, divided by recent local scale.",
  ),
  inputText(
    8,
    "Position in local range",
    "Range pos",
    "market-derived",
    "Current ROC position between the low and high of the agent's mutable local-scale window.",
  ),
  inputText(
    9,
    "Relative trend slope",
    "Rel. trend",
    "market-derived",
    "Linear-regression slope over the agent's mutable trend window, scaled by recent local scale.",
  ),
  inputText(
    10,
    "Relative residual volatility",
    "Rel. residual vol",
    "market-derived",
    "Volatility left after subtracting the estimated local trend line, divided by recent local scale.",
  ),
  inputText(
    11,
    "Relative roughness",
    "Rel. roughness",
    "market-derived",
    "Local jaggedness estimated from scale-normalized curvature and turning-point rate using the agent's mutable roughness sensitivity.",
  ),
  inputText(
    12,
    "Relative cycle rate",
    "Rel. cycle",
    "market-derived",
    "Estimated turning-point cycle rate over the agent's mutable cycle window.",
  ),
  inputText(
    13,
    "Relative volume",
    "Rel. volume",
    "market-derived",
    "Current log volume compared to the agent's mutable local volume scale.",
  ),
  inputText(
    14,
    "Volume delta",
    "Vol. delta",
    "market-derived",
    "Difference between current log volume and the agent's mutable lagged volume sample, divided by local volume scale.",
  ),
  inputText(
    15,
    "Volume acceleration",
    "Vol. accel",
    "market-derived",
    "Change in recent log-volume movement compared with the previous movement over the agent's mutable acceleration lag.",
  ),
  inputText(
    16,
    "RSI signal",
    "RSI",
    "market-derived",
    "RSI over the agent's mutable RSI window, centered so -1 is oversold, 0 is neutral, and 1 is overbought.",
  ),
  inputText(
    17,
    "Volume-price agreement",
    "Vol-price agree",
    "market-derived",
    "Whether volume movement confirms or contradicts the current signal move over the agent's mutable agreement lag.",
  ),
  inputText(
    18,
    "Pending density",
    "Pending density",
    "context-derived",
    "Open opportunity count divided by the agent's mutable pending-density scale.",
  ),
  inputText(19, "Energy ratio", "Energy ratio", "agent-state", "Agent energy divided by reproduction energy."),
  inputText(20, "Health ratio", "Health ratio", "agent-state", "Agent health divided by 100."),
  inputText(21, "Population room ratio", "Pop. room", "context-derived", "Living population room divided by max population, where 1 is empty/open and 0 is full."),
];

function inputText(index: number, label: string, shortLabel: string, category: SpawnerInputCategory, description: string): SpawnerInputMetadataText {
  return { index, label, shortLabel, category, description };
}
