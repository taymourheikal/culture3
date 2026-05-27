import { scenarioById } from "./scenarios";
import type { Controls, ModelKind, ScenarioId, SimulationState, TickResult } from "./types";

export const DEFAULT_CONTROLS: Controls = {
  inputWeight: 1,
  bias: 0,
  memoryWeight: 0.7,
  startingMemory: 0.2,
  resetGate: 0.65,
  updateGate: 0.35,
  forgetGate: 0.7,
  writeGate: 0.45,
  outputGate: 0.8,
};

export function createInitialState(controls: Controls): SimulationState {
  return {
    tick: 0,
    memory: controls.startingMemory,
    cell: controls.startingMemory,
    hidden: controls.startingMemory,
    history: [],
  };
}

export function stepModel(model: ModelKind, scenarioId: ScenarioId, previous: SimulationState, controls: Controls): TickResult {
  const scenario = scenarioById(scenarioId);
  const tick = previous.tick + 1;
  const input = scenario.inputAt(tick);
  const target = scenario.targetAt(tick);
  const previousMemory = previous.memory;
  const previousCell = previous.cell;
  const weightedInput = controls.inputWeight * input + controls.bias;
  const baseCandidate = tanh(weightedInput + controls.memoryWeight * previousMemory);

  if (model === "nn") {
    const output = tanh(weightedInput);
    return checked({
      tick,
      model,
      scenario: scenarioId,
      input,
      target,
      weightedInput,
      previousMemory,
      previousCell,
      candidate: output,
      resetGate: null,
      updateGate: null,
      forgetGate: null,
      writeGate: null,
      outputGate: null,
      memory: previousMemory,
      cell: previousCell,
      output,
      activePaths: { input, memory: 0, candidate: output, gateA: 0, gateB: 0, cell: 0, output },
      formula: `output = tanh(inputWeight * input + bias)\noutput = tanh(${fmt(controls.inputWeight)} * ${fmt(input)} + ${fmt(controls.bias)})\noutput = ${fmt(output)}`,
      narration: `The network reacted only to the current input (${fmt(input)}). Nothing was carried into the next tick as memory.`,
    });
  }

  if (model === "rnn") {
    const memory = baseCandidate;
    return checked({
      tick,
      model,
      scenario: scenarioId,
      input,
      target,
      weightedInput,
      previousMemory,
      previousCell,
      candidate: baseCandidate,
      resetGate: null,
      updateGate: null,
      forgetGate: null,
      writeGate: null,
      outputGate: null,
      memory,
      cell: memory,
      output: memory,
      activePaths: { input, memory: previousMemory, candidate: baseCandidate, gateA: 0, gateB: 0, cell: 0, output: memory },
      formula: `newMemory = tanh(inputPart + memoryWeight * previousMemory)\nnewMemory = tanh(${fmt(weightedInput)} + ${fmt(controls.memoryWeight)} * ${fmt(previousMemory)})\noutput = ${fmt(memory)}`,
      narration: `The RNN mixed current input with previous memory (${fmt(previousMemory)}), then replaced memory with ${fmt(memory)}.`,
    });
  }

  if (model === "gru" || model === "sine-gru") {
    const candidate = tanh(weightedInput + controls.memoryWeight * controls.resetGate * previousMemory);
    const memory = (1 - controls.updateGate) * previousMemory + controls.updateGate * candidate;
    const sinePrefix = model === "sine-gru" ? "Sparse Sine-style " : "";
    return checked({
      tick,
      model,
      scenario: scenarioId,
      input,
      target,
      weightedInput,
      previousMemory,
      previousCell,
      candidate,
      resetGate: controls.resetGate,
      updateGate: controls.updateGate,
      forgetGate: null,
      writeGate: null,
      outputGate: null,
      memory,
      cell: memory,
      output: memory,
      activePaths: {
        input,
        memory: previousMemory,
        candidate,
        gateA: controls.resetGate,
        gateB: controls.updateGate,
        cell: 0,
        output: memory,
      },
      formula: `candidate = tanh(inputPart + memoryWeight * reset * previousMemory)\nnewMemory = (1 - update) * previousMemory + update * candidate\nnewMemory = ${fmt(1 - controls.updateGate)} * ${fmt(previousMemory)} + ${fmt(controls.updateGate)} * ${fmt(candidate)}\noutput = ${fmt(memory)}`,
      narration: `${sinePrefix}GRU used reset=${fmt(controls.resetGate)} to form a candidate, then update=${fmt(controls.updateGate)} to blend old memory into ${fmt(memory)}.`,
    });
  }

  const candidate = baseCandidate;
  const cell = clamp(controls.forgetGate * previousCell + controls.writeGate * candidate);
  const output = controls.outputGate * tanh(cell);
  return checked({
    tick,
    model,
    scenario: scenarioId,
    input,
    target,
    weightedInput,
    previousMemory,
    previousCell,
    candidate,
    resetGate: null,
    updateGate: null,
    forgetGate: controls.forgetGate,
    writeGate: controls.writeGate,
    outputGate: controls.outputGate,
    memory: output,
    cell,
    output,
    activePaths: {
      input,
      memory: previousMemory,
      candidate,
      gateA: controls.forgetGate,
      gateB: controls.writeGate,
      cell,
      output,
    },
    formula: `cell = forget * previousCell + write * candidate\noutput = outputGate * tanh(cell)\ncell = ${fmt(controls.forgetGate)} * ${fmt(previousCell)} + ${fmt(controls.writeGate)} * ${fmt(candidate)}\noutput = ${fmt(output)}`,
    narration: `The LSTM updated its cell to ${fmt(cell)} and exposed ${fmt(output)} through the output gate.`,
  });
}

export function applyTick(previous: SimulationState, result: TickResult): SimulationState {
  return {
    tick: result.tick,
    memory: result.memory,
    cell: result.cell,
    hidden: result.output,
    history: [...previous.history, result].slice(-18),
  };
}

export function assertSimulationFinite(result: TickResult) {
  const values = [
    result.input,
    result.weightedInput,
    result.previousMemory,
    result.previousCell,
    result.candidate,
    result.memory,
    result.cell,
    result.output,
    ...Object.values(result.activePaths),
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Non-finite ${result.model} tick result`);
  }
}

function checked(result: TickResult) {
  assertSimulationFinite(result);
  return result;
}

function tanh(value: number) {
  return Math.tanh(value);
}

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function fmt(value: number) {
  return value.toFixed(2);
}
