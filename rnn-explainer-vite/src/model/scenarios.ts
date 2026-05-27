import type { Scenario, ScenarioId } from "./types";

export const SCENARIOS: Scenario[] = [
  {
    id: "react-now",
    name: "No Memory Needed",
    goal: "The output should react to the input that is visible right now.",
    inputAt: (tick) => Math.sin(tick * 0.85) * 0.85,
    targetAt: (tick) => Math.sin(tick * 0.85) * 0.85,
    notes: ["A feed-forward NN can handle this because the answer depends on the current input.", "Memory is optional here."],
  },
  {
    id: "remember-pulse",
    name: "Remember The Pulse",
    goal: "A blue pulse appears once. Memory models should keep a trace after the input disappears.",
    inputAt: (tick) => (tick === 1 ? 1 : 0),
    targetAt: (tick) => (tick >= 1 && tick <= 6 ? 0.8 : 0),
    notes: ["This is the clearest reason RNNs exist.", "After tick 1, only memory can keep the output positive."],
  },
  {
    id: "forget-noise",
    name: "Forget Stale Noise",
    goal: "The early spike should be forgotten so it does not keep polluting later outputs.",
    inputAt: (tick) => (tick === 1 ? 1 : tick >= 5 ? -0.15 : 0),
    targetAt: (tick) => (tick <= 3 ? 0.6 : 0),
    notes: ["Simple RNNs can hang onto stale signal.", "Gates make forgetting explicit."],
  },
  {
    id: "flip-direction",
    name: "Flip Direction",
    goal: "The model should stop trusting old positive memory when the input turns negative.",
    inputAt: (tick) => (tick <= 3 ? 0.8 : -0.8),
    targetAt: (tick) => (tick <= 3 ? 0.8 : -0.8),
    notes: ["This shows why memory needs control.", "Old memory can fight new evidence."],
  },
  {
    id: "sine-agent",
    name: "Sine Agent Analogy",
    goal: "A market-like signal fades. The agent must decide whether old signal still matters.",
    inputAt: (tick) => Math.sin(tick * 0.7) * Math.max(0.15, 1 - tick * 0.05),
    targetAt: (tick) => Math.sin(tick * 0.7) * Math.max(0.15, 1 - tick * 0.05),
    notes: ["Sine agents see changing market inputs.", "Their sparse GRU-like units decide what to keep as memory."],
  },
];

export function scenarioById(id: ScenarioId) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}
