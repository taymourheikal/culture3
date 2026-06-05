import type { HeadlessAgentAccumulator } from "./agentAccumulator";
import type { HeadlessAgentEligibilityRecord, HeadlessAgentSnapshotRecord, HeadlessTradeRecord } from "./types";

export type HeadlessEligibilityPolicy = {
  runId: string;
  threshold: number;
};

export type HeadlessEligibilityFlush = {
  eligibility: HeadlessAgentEligibilityRecord;
  snapshots: HeadlessAgentSnapshotRecord[];
  trades: HeadlessTradeRecord[];
};

export function createHeadlessEligibilityPolicy(runId: string, minimumResolvedTrades: number): HeadlessEligibilityPolicy {
  return {
    runId,
    threshold: Math.max(0, Math.floor(minimumResolvedTrades)),
  };
}

export function bufferHeadlessSnapshot(agent: HeadlessAgentAccumulator, snapshot: HeadlessAgentSnapshotRecord) {
  agent.bufferedSnapshots.push(snapshot);
  return agent.eligible ? snapshot : null;
}

export function bufferHeadlessTrade(agent: HeadlessAgentAccumulator, trade: HeadlessTradeRecord) {
  agent.bufferedTrades.set(trade.foodId, trade);
  return agent.eligible ? trade : null;
}

export function maybeMarkHeadlessAgentEligible(agent: HeadlessAgentAccumulator, policy: HeadlessEligibilityPolicy, tick: number): HeadlessEligibilityFlush | null {
  if (agent.eligible || agent.resolvedTrades < policy.threshold) return null;
  agent.eligible = true;
  return {
    eligibility: {
      runId: policy.runId,
      spawnerId: agent.spawnerId,
      eligible: true,
      eligibleTick: tick,
      resolvedTrades: agent.resolvedTrades,
    },
    snapshots: [...agent.bufferedSnapshots],
    trades: [...agent.bufferedTrades.values()],
  };
}

export function dropIneligibleHeadlessBuffersIfDone(agent: HeadlessAgentAccumulator) {
  if (agent.eligible || agent.deathTick === null || agent.openTrades.size > 0) return;
  agent.bufferedSnapshots = [];
  agent.bufferedTrades.clear();
}
