import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { SpawnerInspectionPayload } from "./marketWorkerProtocol";
import { deleteSineSession, getSineSessionAnalysis, getSineSpawnerInspection, listSineSessions } from "./history/sineHistoryApi";
import type { SineSessionAnalysis, SineSessionSummary } from "./history/sineHistoryTypes";
import { HistoricalRnnLookup } from "./history/HistoricalRnnLookup";
import { RunComparisonPanel, RunDiagnosticsDashboard } from "./history/RunDiagnosticsPanels";
import { SavedRunList } from "./history/SavedRunList";

const RANGE_PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

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
  const [comparisonSessionId, setComparisonSessionId] = useState("");
  const [comparisonAnalysis, setComparisonAnalysis] = useState<SineSessionAnalysis | null>(null);
  const [fromPercent, setFromPercent] = useState(0);
  const [toPercent, setToPercent] = useState(100);
  const [spawnerId, setSpawnerId] = useState("");
  const [tick, setTick] = useState("");
  const [status, setStatus] = useState("Saved runs not checked yet");
  const primaryAnalysisRequestId = useRef(0);
  const comparisonAnalysisRequestId = useRef(0);

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

  const currentRange = () => ({ fromPercent, toPercent });

  const loadAnalysis = async (sessionId = selectedSessionId, range = currentRange()) => {
    if (!sessionId) {
      setStatus("Choose a run first");
      return;
    }
    const requestId = primaryAnalysisRequestId.current + 1;
    primaryAnalysisRequestId.current = requestId;
    try {
      setStatus("Loading saved run");
      const nextAnalysis = await getSineSessionAnalysis(sessionId, range);
      if (requestId !== primaryAnalysisRequestId.current) return;
      setAnalysis(nextAnalysis);
      setSelectedSessionId(sessionId);
      if (comparisonSessionId === sessionId) {
        setComparisonSessionId("");
        setComparisonAnalysis(null);
      }
      setStatus(`Loaded ${sessionId.slice(0, 8)}`);
    } catch {
      if (requestId !== primaryAnalysisRequestId.current) return;
      setStatus("Could not load saved run");
    }
  };

  const loadComparisonAnalysis = async (sessionId: string, range = currentRange()) => {
    setComparisonSessionId(sessionId);
    const requestId = comparisonAnalysisRequestId.current + 1;
    comparisonAnalysisRequestId.current = requestId;
    if (!sessionId) {
      setComparisonAnalysis(null);
      return;
    }
    if (sessionId === selectedSessionId) {
      setStatus("Choose a different run for comparison");
      setComparisonAnalysis(null);
      return;
    }
    try {
      setStatus("Loading comparison run");
      const nextAnalysis = await getSineSessionAnalysis(sessionId, range);
      if (requestId !== comparisonAnalysisRequestId.current) return;
      setComparisonAnalysis(nextAnalysis);
      setStatus(`Comparing ${selectedSessionId.slice(0, 8)} with ${sessionId.slice(0, 8)}`);
    } catch {
      if (requestId !== comparisonAnalysisRequestId.current) return;
      setComparisonAnalysis(null);
      setStatus("Could not load comparison run");
    }
  };

  const updateRange = (nextFromPercent = fromPercent, nextToPercent = toPercent) => {
    const nextRange = normalizePercentRange(nextFromPercent, nextToPercent);
    setFromPercent(nextRange.fromPercent);
    setToPercent(nextRange.toPercent);
    if (selectedSessionId) void loadAnalysis(selectedSessionId, nextRange);
    if (comparisonSessionId) void loadComparisonAnalysis(comparisonSessionId, nextRange);
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
      if (sessionIds.includes(comparisonSessionId)) {
        setComparisonAnalysis(null);
        setComparisonSessionId("");
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
            void loadAnalysis(sessionId, currentRange());
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

          {analysis ? (
            <>
              <div className="sine-history-compare-toolbar">
                <label>
                  From
                  <select value={fromPercent} onChange={(event) => updateRange(Number(event.target.value), toPercent)}>
                    {RANGE_PERCENT_OPTIONS.filter((percent) => percent < toPercent).map((percent) => (
                      <option key={percent} value={percent}>{percent}%</option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select value={toPercent} onChange={(event) => updateRange(fromPercent, Number(event.target.value))}>
                    {RANGE_PERCENT_OPTIONS.filter((percent) => percent > fromPercent).map((percent) => (
                      <option key={percent} value={percent}>{percent}%</option>
                    ))}
                  </select>
                </label>
                <label>
                  Compare with
                  <select value={comparisonSessionId} onChange={(event) => void loadComparisonAnalysis(event.target.value, currentRange())}>
                    <option value="">None</option>
                    {sessions
                      .filter((session) => session.id !== selectedSessionId)
                      .map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.id.slice(0, 8)} · tick {session.latestTick ?? 0}
                        </option>
                      ))}
                  </select>
                </label>
                {comparisonSessionId ? <button type="button" onClick={() => void loadComparisonAnalysis("")}>Clear comparison</button> : null}
                <span className="sine-history-range-readout">
                  Showing {analysis.diagnostics.range.fromPercent}%-{analysis.diagnostics.range.toPercent}% · ticks {analysis.diagnostics.range.fromTick.toLocaleString()}-{analysis.diagnostics.range.toTick.toLocaleString()}
                </span>
              </div>
              {comparisonAnalysis ? <RunComparisonPanel primary={analysis} comparison={comparisonAnalysis} /> : null}
              <HeadlessReconstructionAvailability session={sessions.find((session) => session.id === analysis.session.id) ?? null} />
              <RunDiagnosticsDashboard analysis={analysis} />
            </>
          ) : (
            <div className="sine-history-empty">Load a saved run to inspect population resilience, payoff drawdowns, trade quality, risk, population structure, and RNNs.</div>
          )}

          <section className="sine-workbench-panel">
            <div className="sine-workbench-panel-head">
              <div>
                <span className="sine-eyebrow">Secondary inspector</span>
                <h2>Historical RNN Lookup</h2>
              </div>
            </div>
            <HistoricalRnnLookup
              spawnerId={spawnerId}
              tick={tick}
              setSpawnerId={setSpawnerId}
              setTick={setTick}
              onInspect={() => void loadInspection()}
            />
          </section>
        </div>
      </div>
    </section>
  );
}

function HeadlessReconstructionAvailability({ session }: { session: SineSessionSummary | null }) {
  if (!session || session.runMode !== "headless") return null;
  const reconstructableAgents = session.reconstructableAgents ?? 0;
  const reconstructionSnapshots = session.reconstructionSnapshots ?? 0;
  const eligibleAgents = session.eligibleAgents ?? 0;
  return (
    <section className="sine-workbench-panel">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Seed-bank reconstruction</span>
          <h2>Reconstructable Agents</h2>
        </div>
        <strong>{reconstructableAgents.toLocaleString()} agents</strong>
      </div>
      {reconstructableAgents > 0 ? (
        <div className="sine-history-summary">
          <span className="sine-history-summary-label">Snapshot availability</span>
          <strong>{reconstructionSnapshots.toLocaleString()} snapshots · {eligibleAgents.toLocaleString()} eligible agents</strong>
        </div>
      ) : (
        <div className="sine-history-empty">This headless run has no seed-bank reconstruction snapshots.</div>
      )}
    </section>
  );
}

function normalizePercentRange(fromPercent: number, toPercent: number) {
  const safeFrom = clampPercent(fromPercent, 0);
  const safeTo = clampPercent(toPercent, 100);
  if (safeFrom < safeTo) return { fromPercent: safeFrom, toPercent: safeTo };
  if (safeFrom >= 100) return { fromPercent: 90, toPercent: 100 };
  return { fromPercent: safeFrom, toPercent: Math.min(100, safeFrom + 10) };
}

function clampPercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}
