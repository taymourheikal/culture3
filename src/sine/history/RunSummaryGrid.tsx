import type { SineSessionSummary } from "./sineHistoryTypes";
import { sessionSourceLabel, sessionStartLabel } from "./historyLabels";
import { HistorySummaryItem, shortSessionId } from "./HistoryUi";

export function RunSummaryGrid({ selectedSession }: { selectedSession: SineSessionSummary | null }) {
  if (!selectedSession) return null;
  return (
    <div className="sine-run-summary-grid">
      <HistorySummaryItem label="Run" value={shortSessionId(selectedSession.id)} />
      <HistorySummaryItem label="Status" value={selectedSession.status} />
      <HistorySummaryItem label="Source" value={sessionSourceLabel(selectedSession.settings)} />
      <HistorySummaryItem label="Start" value={sessionStartLabel(selectedSession.settings)} />
      <HistorySummaryItem label="Latest tick" value={String(selectedSession.latestTick ?? 0)} />
      <HistorySummaryItem label="Births" value={String(selectedSession.births)} />
      <HistorySummaryItem label="Deaths" value={String(selectedSession.deaths)} />
      <HistorySummaryItem label="States" value={String(selectedSession.stateSnapshots)} />
    </div>
  );
}

export function OutcomeSummary({
  outcome,
}: {
  outcome: {
    spawned: number;
    resolved: number;
    pending: number;
    wins: number;
    losses: number;
    averagePayoff: number;
  };
}) {
  return (
    <div className="sine-run-summary-grid">
      <HistorySummaryItem label="Food spawned" value={String(outcome.spawned)} />
      <HistorySummaryItem label="Resolved" value={String(outcome.resolved)} />
      <HistorySummaryItem label="Pending" value={String(outcome.pending)} />
      <HistorySummaryItem label="Wins" value={String(outcome.wins)} />
      <HistorySummaryItem label="Losses" value={String(outcome.losses)} />
      <HistorySummaryItem label="Avg payoff" value={outcome.averagePayoff.toFixed(3)} />
    </div>
  );
}
