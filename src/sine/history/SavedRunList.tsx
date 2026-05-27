import type { SineSessionSummary } from "./sineHistoryTypes";
import { sessionSourceLabel } from "./historyLabels";
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
            <strong>{shortSessionId(session.id)}</strong>
            <span>{session.status} · {sessionSourceLabel(session.settings)} · tick {session.latestTick ?? 0}</span>
            <span>{session.births} born · {session.deaths} dead · {session.stateSnapshots} states</span>
          </button>
        </div>
      ))}
      {sessions.length === 0 ? <div className="sine-history-empty">Press Play to create a saved run.</div> : null}
    </div>
  );
}
