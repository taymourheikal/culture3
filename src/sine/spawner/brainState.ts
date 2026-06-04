import type { CompiledBrainPlan } from "./brainPlan";
import type { SpawnerGenome } from "./types";

export type HiddenStateArray = number[];

export function hiddenRecordToArray(plan: Pick<CompiledBrainPlan, "unitIds">, hiddenState: Record<number, number>): HiddenStateArray {
  const values = new Array<number>(plan.unitIds.length);
  return hiddenRecordToArrayInto(plan, hiddenState, values);
}

export function hiddenRecordToArrayInto(
  plan: Pick<CompiledBrainPlan, "unitIds">,
  hiddenState: Record<number, number>,
  target: HiddenStateArray,
): HiddenStateArray {
  target.length = plan.unitIds.length;
  for (let index = 0; index < plan.unitIds.length; index += 1) {
    target[index] = finiteHiddenValue(hiddenState[plan.unitIds[index] ?? -1]);
  }
  return target;
}

export function hiddenArrayToCurrentRecord(plan: Pick<CompiledBrainPlan, "unitIds">, hiddenState: ArrayLike<number>) {
  const record: Record<number, number> = {};
  for (let index = 0; index < plan.unitIds.length; index += 1) {
    const unitId = plan.unitIds[index];
    if (unitId === undefined) continue;
    record[unitId] = finiteHiddenValue(hiddenState[index] ?? 0);
  }
  return record;
}

export function mergeHiddenStateRecord(
  genome: Pick<SpawnerGenome, "units">,
  plan: Pick<CompiledBrainPlan, "unitIds">,
  previousRecord: Record<number, number>,
  currentArray: ArrayLike<number>,
) {
  return {
    ...alignedHiddenStateRecord(genome, previousRecord),
    ...hiddenArrayToCurrentRecord(plan, currentArray),
  };
}

export function alignedHiddenStateRecord(genome: Pick<SpawnerGenome, "units">, hiddenState: Record<number, number>) {
  const nextState = { ...hiddenState };
  for (const unit of genome.units) {
    if (!Number.isFinite(nextState[unit.unitId])) nextState[unit.unitId] = 0;
  }
  return nextState;
}

function finiteHiddenValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
