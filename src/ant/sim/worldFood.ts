import { clamp, wrapPosition } from "./math";
import type { FoodPatch, SimulationParameters, WorldConfig, WorldState } from "./types";
import type { Rng } from "./rng";

export function createFoodPatches(rng: Rng, config: WorldConfig, parameters: SimulationParameters): FoodPatch[] {
  const food = parameters.food;
  return Array.from({ length: food.patchCount }, (_, index) => ({
    id: index + 1,
    center: {
      x: rng.range(food.patchMargin, config.width - food.patchMargin),
      y: rng.range(food.patchMargin, config.height - food.patchMargin),
    },
    radius: rng.range(food.patchRadius.min, food.patchRadius.max),
    richness: rng.range(food.patchRichness.min, food.patchRichness.max),
  }));
}

export function addFood(world: WorldState, rng: Rng) {
  const foodParameters = world.parameters.food;
  const patch = weightedPatch(world.foodPatches, rng);
  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.sqrt(rng.next()) * patch.radius;
  const position = wrapPosition(
    {
      x: patch.center.x + Math.cos(angle) * radius,
      y: patch.center.y + Math.sin(angle) * radius,
    },
    world.config.width,
    world.config.height,
  );

  world.food.push({
    id: world.nextFoodId,
    patchId: patch.id,
    position,
    energy: rng.range(foodParameters.foodEnergy.min, foodParameters.foodEnergy.max) * patch.richness,
    radius: rng.range(foodParameters.foodRadius.min, foodParameters.foodRadius.max),
  });
  world.nextFoodId += 1;
}

export function growFood(world: WorldState, rng: Rng) {
  const food = world.parameters.food;
  const deficit = world.config.maxFood - world.food.length;
  if (deficit <= 0) return;
  const probability = clamp(deficit / world.config.maxFood, food.spawnProbabilityMin, food.spawnProbabilityMax);
  const additions = Math.min(deficit, rng.chance(probability) ? 1 + (rng.chance(food.secondFoodChance) ? 1 : 0) : 0);
  for (let i = 0; i < additions; i += 1) {
    addFood(world, rng);
  }
}

function weightedPatch(patches: FoodPatch[], rng: Rng) {
  const total = patches.reduce((sum, patch) => sum + patch.richness, 0);
  let roll = rng.range(0, total);
  for (const patch of patches) {
    roll -= patch.richness;
    if (roll <= 0) return patch;
  }
  return patches[patches.length - 1] as FoodPatch;
}
