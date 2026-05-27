import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { SpawnerInspectionPayload } from "./marketWorkerProtocol";
import { deleteSineSession, getSineSessionAnalysis, getSineSpawnerInspection, listSineSessions } from "./history/sineHistoryApi";
import type { SineSessionAnalysis, SineSessionSummary } from "./history/sineHistoryTypes";
import { HistoricalEntityTables } from "./history/HistoricalEntityTables";
import { HistoricalRnnLookup } from "./history/HistoricalRnnLookup";
import { HistoricalTelemetryChart } from "./history/HistoricalTelemetryChart";
import { OutcomeSummary, RunSummaryGrid } from "./history/RunSummaryGrid";
import { SavedRunList } from "./history/SavedRunList";

export function SineHistoricalInspector({
  activeSessionId,
  activeRunState,
  onLoad,
}: {
  activeSessionId: string | null;
  activeRunState: "idle" | "running" | "paused" | "stopped";
  onLoad: (payload: SpawnerInspectionPayload) => void;
}) {
  const [sessions, setSessions] = useState<SineSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [checkedSessionIds, setCheckedSessionIds] = useState<Set<string>>(() => new Set());
  const [analysis, setAnalysis] = useState<SineSessionAnalysis | null>(null);
  const [spawnerId, setSpawnerId] = useState("");
  const [tick, setTick] = useState("");
  const [status, setStatus] = useState("Saved runs not checked yet");

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const selectedIsActive =
    !!activeSessionId &&
    selectedSessionId === activeSessionId &&
    (activeRunState === "running" || activeRunState === "paused");

  const refreshSessions = async () => {
    try {
      const nextSessions = await listSineSessions(50);
      setSessions(nextSessions);
      setSelectedSessionId((current) => (nextSessions.some((session) => session.id === current) ? current : nextSessions[0]?.id || ""));
      setStatus(nextSessions.length > 0 ? `${nextSessions.length} saved Toy Market runs` : "No saved Toy Market runs yet");
    } catch {
      setStatus("Saved-run browser offline");
    }
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

  useEffect(() => {
    setCheckedSessionIds((current) => {
      const availableIds = new Set(sessions.map((session) => session.id));
      const next = new Set([...current].filter((sessionId) => availableIds.has(sessionId)));
      return next.size === current.size ? current : next;
    });
  }, [sessions]);

  const loadAnalysis = async (sessionId = selectedSessionId) => {
    if (!sessionId) {
      setStatus("Choose a run first");
      return;
    }
    try {
      setStatus("Loading saved run");
      const nextAnalysis = await getSineSessionAnalysis(sessionId);
      setAnalysis(nextAnalysis);
      setSelectedSessionId(sessionId);
      setStatus(`Loaded ${sessionId.slice(0, 8)}`);
    } catch {
      setStatus("Could not load saved run");
    }
  };

  const deleteSession = async () => {
    if (!selectedSessionId) return;
    if (selectedIsActive) {
      setStatus("Stop the active run before deleting it");
      return;
    }
    const confirmed = window.confirm(`Delete saved run ${selectedSessionId.slice(0, 8)}?`);
    if (!confirmed) return;
    try {
      await deleteSineSession(selectedSessionId);
      setAnalysis(null);
      setSelectedSessionId("");
      await refreshSessions();
      setStatus("Deleted saved run");
    } catch {
      setStatus("Could not delete saved run");
    }
  };

  const deleteCheckedSessions = async () => {
    const sessionIds = [...checkedSessionIds];
    if (sessionIds.length === 0) {
      setStatus("Check one or more saved runs first");
      return;
    }
    if (activeSessionId && sessionIds.includes(activeSessionId) && (activeRunState === "running" || activeRunState === "paused")) {
      setStatus("Stop the active run before deleting it");
      return;
    }
    const confirmed = window.confirm(`Delete ${sessionIds.length} saved run${sessionIds.length === 1 ? "" : "s"}?`);
    if (!confirmed) return;
    try {
      await Promise.all(sessionIds.map((sessionId) => deleteSineSession(sessionId)));
      if (sessionIds.includes(selectedSessionId)) {
        setAnalysis(null);
        setSelectedSessionId("");
      }
      setCheckedSessionIds(new Set());
      await refreshSessions();
      setStatus(`Deleted ${sessionIds.length} saved run${sessionIds.length === 1 ? "" : "s"}`);
    } catch {
      setStatus("Could not delete selected saved runs");
    }
  };

  const loadInspection = async (targetSpawnerId?: number) => {
    const parsedSpawnerId = Math.floor(Number(targetSpawnerId ?? spawnerId));
    if (!selectedSessionId || !Number.isFinite(parsedSpawnerId) || parsedSpawnerId <= 0) {
      setStatus("Choose a run and valid spawner ID");
      return;
    }
    const parsedTick = tick.trim() ? Math.floor(Number(tick)) : null;
    if (parsedTick !== null && (!Number.isFinite(parsedTick) || parsedTick < 0)) {
      setStatus("Tick must be a positive integer");
      return;
    }
    try {
      setStatus("Loading historical RNN");
      const payload = await getSineSpawnerInspection(selectedSessionId, parsedSpawnerId, parsedTick);
      onLoad(payload);
      setSpawnerId(String(parsedSpawnerId));
      setStatus(`Loaded RNN #${parsedSpawnerId}`);
    } catch {
      setStatus("Historical RNN not found");
    }
  };

  return (
    <section className="sine-history-inspector">
      <div className="sine-history-header">
        <div>
          <span className="sine-eyebrow">Saved Runs</span>
          <h2>SQLite Run Browser</h2>
        </div>
        <div className="sine-history-actions">
          <button type="button" onClick={refreshSessions}>Refresh</button>
          <button type="button" onClick={() => void loadAnalysis()} disabled={!selectedSessionId}>Load</button>
          <button type="button" onClick={deleteSession} disabled={!selectedSessionId || selectedIsActive}>
            <Trash2 size={15} />
            Delete
          </button>
          <button type="button" onClick={deleteCheckedSessions} disabled={checkedSessionIds.size === 0}>
            <Trash2 size={15} />
            Delete Selected ({checkedSessionIds.size})
          </button>
        </div>
      </div>

      <div className="sine-history-layout">
        <SavedRunList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          checkedSessionIds={checkedSessionIds}
          onSelect={(sessionId) => {
            setSelectedSessionId(sessionId);
            void loadAnalysis(sessionId);
          }}
          onToggleChecked={(sessionId) => {
            setCheckedSessionIds((current) => {
              const next = new Set(current);
              if (next.has(sessionId)) {
                next.delete(sessionId);
              } else {
                next.add(sessionId);
              }
              return next;
            });
          }}
          onCheckAll={() => setCheckedSessionIds(new Set(sessions.map((session) => session.id)))}
          onClearChecked={() => setCheckedSessionIds(new Set())}
        />

        <div className="sine-run-analysis">
          <div className="sine-history-status">{status}</div>
          <RunSummaryGrid selectedSession={selectedSession} />

          {analysis ? (
            <>
              <HistoricalTelemetryChart telemetry={analysis.telemetry} />
              <OutcomeSummary outcome={analysis.outcome} />
              <HistoricalEntityTables analysis={analysis} onInspect={(id) => void loadInspection(id)} />
            </>
          ) : (
            <div className="sine-history-empty">Load a saved run to inspect population, loss, lineages, outcomes, uniqueness, and RNNs.</div>
          )}

          <HistoricalRnnLookup
            spawnerId={spawnerId}
            tick={tick}
            setSpawnerId={setSpawnerId}
            setTick={setTick}
            onInspect={() => void loadInspection()}
          />
        </div>
      </div>
    </section>
  );
}
