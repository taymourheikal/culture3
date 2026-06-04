import type { RosterSpawnerSummary, SelectedSpawnerTimeline } from "./marketWorkerProtocol";

export type SelectedSpawnerPanelModel = {
  id: number;
  status: "none" | "live" | "outside_roster_packet" | "missing";
  sampleCount: number;
  latestSample: SelectedSpawnerTimeline["samples"][number] | null;
  ageTicks: number | null;
  worldTick: number;
  rosterTick: number | null;
  latestSampleTick: number | null;
  spawnedResolvedRatio: number;
};

export function createSelectedSpawnerPanelModel({
  selectedSpawner,
  selectedSpawnerId,
  worldTick,
  rosterTick,
  timeline,
}: {
  selectedSpawner: RosterSpawnerSummary | null;
  selectedSpawnerId: number | null;
  worldTick: number;
  rosterTick: number | null;
  timeline: SelectedSpawnerTimeline | null;
}): SelectedSpawnerPanelModel {
  if (!selectedSpawner && selectedSpawnerId === null) {
    return {
      id: 0,
      status: "none",
      sampleCount: 0,
      latestSample: null,
      ageTicks: null,
      worldTick: safeTick(worldTick),
      rosterTick,
      latestSampleTick: null,
      spawnedResolvedRatio: 0,
    };
  }

  const id = selectedSpawner?.id ?? selectedSpawnerId ?? 0;
  const sampleCount = timeline?.samples.length ?? 0;
  const latestSample = timeline?.samples.at(-1) ?? null;
  const status = selectedSpawner ? "live" : timeline?.status === "missing" ? "missing" : "outside_roster_packet";
  const activeWorldTick = safeTick(worldTick);
  const ageTicks = selectedSpawner ? Math.max(0, Math.floor(activeWorldTick - selectedSpawner.birthTick)) : null;
  const spawnedResolvedRatio =
    selectedSpawner && selectedSpawner.spawnedCount > 0
      ? Math.max(0, Math.min(1, selectedSpawner.resolvedCount / selectedSpawner.spawnedCount))
      : 0;

  return {
    id,
    status,
    sampleCount,
    latestSample,
    ageTicks,
    worldTick: activeWorldTick,
    rosterTick,
    latestSampleTick: latestSample?.tick ?? null,
    spawnedResolvedRatio,
  };
}

function safeTick(tick: number) {
  return Math.max(0, Math.floor(Number.isFinite(tick) ? tick : 0));
}
