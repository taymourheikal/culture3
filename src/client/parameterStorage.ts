import { DEFAULT_SIMULATION_PARAMETERS, cloneParameters, mergeParameters, sanitizeParameters } from "../sim/parameters";
import type { SimulationParameters } from "../sim/types";

const STORAGE_KEY = "emergent-ant-world.parameters.v1";

export function loadSavedParameters(): SimulationParameters {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return cloneParameters();
    return sanitizeParameters(mergeParameters(DEFAULT_SIMULATION_PARAMETERS, JSON.parse(saved) as Partial<SimulationParameters>));
  } catch {
    return cloneParameters();
  }
}

export function saveParameters(parameters: SimulationParameters) {
  const sanitized = sanitizeParameters(parameters);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}
