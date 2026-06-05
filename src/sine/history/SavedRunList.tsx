import type { SineSessionSummary } from "./sineHistoryTypes";
import { sourceLabelFromSession } from "./historyLabels";
import { shortSessionId } from "./HistoryUi";

export function SavedRunList({
  sessions,
  selectedSessionId,
  checkedSessionIds,
  onSelect,
  onToggleChecked,
  onCheckAll,
  onClearChecked,
}: {
  sessions: SineSessionSummary[];
  selectedSessionId: string;
  checkedSessionIds: Set<string>;
  onSelect: (sessionId: string) => void;
  onToggleChecked: (sessionId: string) => void;
  onCheckAll: () => void;
  onClearChecked: () => void;
}) {
  return (
    <div className="sine-run-list" aria-label="Saved Toy Market runs">
      {sessions.length > 0 ? (
        <div className="sine-run-list-tools">
          <button type="button" onClick={onCheckAll}>Select all</button>
          <button type="button" onClick={onClearChecked} disabled={checkedSessionIds.size === 0}>Clear</button>
          <span>{checkedSessionIds.size} selected</span>
        </div>
      ) : null}
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`sine-run-list-row${session.id === selectedSessionId ? " active" : ""}${checkedSessionIds.has(session.id) ? " checked" : ""}`}
        >
          <label className="sine-run-check" aria-label={`Select saved run ${shortSessionId(session.id)}`}>
            <input
              type="checkbox"
              checked={checkedSessionIds.has(session.id)}
              onChange={() => onToggleChecked(session.id)}
            />
          </label>
          <button type="button" onClick={() => onSelect(session.id)}>
            <span className="sine-run-list-title-line">
              <strong>{shortSessionId(session.id)}</strong>
              <em>{runModeLabel(session)}</em>
            </span>
            <span>{session.status} · {sourceLabelFromSession(session)} · tick {(session.latestTick ?? 0).toLocaleString()}{session.targetTicks ? ` / ${session.targetTicks.toLocaleString()}` : ""}</span>
            <span>{session.births.toLocaleString()} born · {session.deaths.toLocaleString()} dead · {session.stateSnapshots.toLocaleString()} states</span>
            <span>{timeLabel(session)}{headlessAvailabilityLabel(session)}</span>
          </button>
        </div>
      ))}
      {sessions.length === 0 ? <div className="sine-history-empty">Press Play to create a saved run.</div> : null}
    </div>
  );
}

function runModeLabel(session: SineSessionSummary) {
  return session.runMode === "headless" ? "Runs" : "Lab";
}

function timeLabel(session: SineSessionSummary) {
  const created = formatTimestamp(session.createdAt);
  const latest = formatTimestamp(session.completedAt ?? session.updatedAt);
  return `created ${created} · ${session.completedAt ? "completed" : "updated"} ${latest}`;
}

function formatTimestamp(timestamp: string | null | undefined) {
  return timestamp ? new Date(timestamp).toLocaleString() : "-";
}

function headlessAvailabilityLabel(session: SineSessionSummary) {
  if (session.runMode !== "headless") return "";
  const reconstructableAgents = session.reconstructableAgents ?? 0;
  const snapshots = session.reconstructionSnapshots ?? 0;
  if (reconstructableAgents <= 0 || snapshots <= 0) return " · no seed-bank snapshots";
  return ` · ${reconstructableAgents.toLocaleString()} reconstructable · ${snapshots.toLocaleString()} snapshots`;
}
