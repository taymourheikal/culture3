import type { SpawnerAgent } from "./spawnerSimulation";

export type SineSeedBankRecord = {
  id: string;
  label: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type SineSeedBankSourceAgent = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  parentSpawnerId: number | null;
  birthTick: number | null;
  deathTick: number | null;
  lifespanTicks: number | null;
};

export type SineSeedBankFrozenSnapshot = {
  sourceTick: number;
  sourceReason: string;
  schemaVersion: number;
  genome: SpawnerAgent["genome"];
  hiddenState: SpawnerAgent["hiddenState"];
  learnedState: SpawnerAgent["learnedState"];
  createdAt?: string;
};

export type SineSeedBankAdmissionContext = {
  metrics: Record<string, unknown>;
  filters: Record<string, unknown>;
};

export type SineSeedBankEntrySummary = {
  id: string;
  bankId: string;
  source: SineSeedBankSourceAgent;
  reconstructionSnapshotCount: number;
  admission: SineSeedBankAdmissionContext;
  createdAt: string;
};

export type SineSeedBankEntry = SineSeedBankEntrySummary & {
  snapshots: SineSeedBankFrozenSnapshot[];
};

export type SineSeedBankEntryInput = {
  id?: string;
  bankId: string;
  source: SineSeedBankSourceAgent;
  admission: SineSeedBankAdmissionContext;
  snapshots: SineSeedBankFrozenSnapshot[];
};
