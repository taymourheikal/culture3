import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import type { SpawnerAgent } from "./types";

export type SpawnerRuntimeContext = {
  spawners: SpawnerAgent[];
  plans: CompiledBrainPlan[];
};

export function createSpawnerRuntimeContext(spawners: SpawnerAgent[]): SpawnerRuntimeContext {
  const plans = new Array<CompiledBrainPlan>(spawners.length);
  for (let index = 0; index < spawners.length; index += 1) {
    const spawner = spawners[index];
    if (!spawner) continue;
    plans[index] = ensureCompiledBrainPlan(spawner.genome);
  }
  return {
    spawners,
    plans,
  };
}

export function spawnerRuntimeContextMatches(context: SpawnerRuntimeContext, spawners: SpawnerAgent[]) {
  if (context.spawners.length !== spawners.length) return false;
  for (let index = 0; index < spawners.length; index += 1) {
    const spawner = spawners[index];
    if (!spawner || context.spawners[index]?.id !== spawner.id) return false;
  }
  return true;
}

export function planForAlignedSpawner(context: SpawnerRuntimeContext | undefined, spawner: SpawnerAgent, index: number) {
  return context?.spawners[index]?.id === spawner.id ? context.plans[index] : undefined;
}
