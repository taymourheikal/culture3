export type ModelKind = "nn" | "rnn" | "gru" | "lstm" | "sine-gru";

export type ScenarioId = "react-now" | "remember-pulse" | "forget-noise" | "flip-direction" | "sine-agent";

export type Controls = {
  inputWeight: number;
  bias: number;
  memoryWeight: number;
  startingMemory: number;
  resetGate: number;
  updateGate: number;
  forgetGate: number;
  writeGate: number;
  outputGate: number;
};

export type SimulationState = {
  tick: number;
  memory: number;
  cell: number;
  hidden: number;
  history: TickResult[];
};

export type TickResult = {
  tick: number;
  model: ModelKind;
  scenario: ScenarioId;
  input: number;
  target: number | null;
  weightedInput: number;
  previousMemory: number;
  previousCell: number;
  candidate: number;
  resetGate: number | null;
  updateGate: number | null;
  forgetGate: number | null;
  writeGate: number | null;
  outputGate: number | null;
  memory: number;
  cell: number;
  output: number;
  activePaths: Record<"input" | "memory" | "candidate" | "gateA" | "gateB" | "cell" | "output", number>;
  formula: string;
  narration: string;
};

export type Scenario = {
  id: ScenarioId;
  name: string;
  goal: string;
  inputAt: (tick: number) => number;
  targetAt: (tick: number) => number | null;
  notes: string[];
};

export type Lesson = {
  id: string;
  title: string;
  model: ModelKind;
  scenario: ScenarioId;
  summary: string;
  plain: string;
  watch: string[];
  controls: Array<keyof Controls>;
};
