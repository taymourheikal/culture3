import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { SpawnerInspectionPayload } from "./marketWorkerProtocol";
import { deleteSineSession, getSineSessionAnalysis, getSineSpawnerInspection, listSineSessions } from "./history/sineHistoryApi";
import type { SineSessionAnalysis, SineSessionSummary } from "./history/sineHistoryTypes";

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
      setSelectedSessionId((current) => current || nextSessions[0]?.id || "");
      setStatus(nextSessions.length > 0 ? `${nextSessions.length} saved Toy Market runs` : "No saved Toy Market runs yet");
    } catch {
      setStatus("Saved-run browser offline");
    }
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

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
        </div>
      </div>

      <div className="sine-history-layout">
        <div className="sine-run-list" aria-label="Saved Toy Market runs">
          {sessions.map((session) => (
            <button
              type="button"
              key={session.id}
              className={session.id === selectedSessionId ? "active" : ""}
              onClick={() => {
                setSelectedSessionId(session.id);
                void loadAnalysis(session.id);
              }}
            >
              <strong>{session.id.slice(0, 8)}</strong>
              <span>{session.status} · {sessionSourceLabel(session.settings)} · tick {session.latestTick ?? 0}</span>
              <span>{session.births} born · {session.deaths} dead · {session.stateSnapshots} states</span>
            </button>
          ))}
          {sessions.length === 0 ? <div className="sine-history-empty">Press Play to create a saved run.</div> : null}
        </div>

        <div className="sine-run-analysis">
          <div className="sine-history-status">{status}</div>
          {selectedSession ? (
            <div className="sine-run-summary-grid">
              <Summary label="Run" value={selectedSession.id.slice(0, 8)} />
              <Summary label="Status" value={selectedSession.status} />
              <Summary label="Source" value={sessionSourceLabel(selectedSession.settings)} />
              <Summary label="Start" value={sessionStartLabel(selectedSession.settings)} />
              <Summary label="Latest tick" value={String(selectedSession.latestTick ?? 0)} />
              <Summary label="Births" value={String(selectedSession.births)} />
              <Summary label="Deaths" value={String(selectedSession.deaths)} />
              <Summary label="States" value={String(selectedSession.stateSnapshots)} />
            </div>
          ) : null}

          {analysis ? (
            <>
              <TelemetrySparkline telemetry={analysis.telemetry} />
              <OutcomeSummary analysis={analysis} />
              <EntityTables analysis={analysis} onInspect={(id) => void loadInspection(id)} />
            </>
          ) : (
            <div className="sine-history-empty">Load a saved run to inspect population, loss, lineages, outcomes, uniqueness, and RNNs.</div>
          )}

          <div className="sine-history-rnn-fields">
            <label>
              Spawner ID
              <input type="number" min={1} step={1} value={spawnerId} placeholder="471" onChange={(event) => setSpawnerId(event.target.value)} />
            </label>
            <label>
              Tick
              <input type="number" min={0} step={1} value={tick} placeholder="latest" onChange={(event) => setTick(event.target.value)} />
            </label>
            <button type="button" onClick={() => void loadInspection()}>
              <Search size={15} />
              Inspect RNN
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="sine-history-summary">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function sessionSourceLabel(settings: Record<string, unknown> | undefined) {
  const source = typeof settings?.source === "string" ? settings.source : "generated";
  if (source === "btcusd_1m") return "BTCUSD 1m";
  if (source === "btcusd_5m") return "BTCUSD 5m";
  return "Generated";
}

function sessionStartLabel(settings: Record<string, unknown> | undefined) {
  const playback = settings?.playback;
  if (!playback || typeof playback !== "object") return "-";
  const start = (playback as Record<string, unknown>).startDateTime;
  return typeof start === "string" && start ? start : "-";
}

function TelemetrySparkline({ telemetry }: { telemetry: SineSessionAnalysis["telemetry"] }) {
  if (telemetry.length === 0) return <div className="sine-history-empty">No population snapshots saved for this run.</div>;
  const width = 640;
  const height = 150;
  const maxTick = Math.max(...telemetry.map((point) => point.tick), 1);
  const maxPopulation = Math.max(...telemetry.map((point) => point.population), 1);
  const maxLoss = Math.max(...telemetry.map((point) => point.rollingLoss), 1);
  const populationPath = toPath(telemetry, width, height, maxTick, maxPopulation, "population");
  const lossPath = toPath(telemetry, width, height, maxTick, maxLoss, "rollingLoss");
  return (
    <div className="sine-history-chart">
      <div className="sine-history-section-title">Population & Rolling Loss</div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Saved run population and rolling loss">
        <path d={populationPath} className="history-population-line" />
        <path d={lossPath} className="history-loss-line" />
      </svg>
      <div className="sine-history-legend">
        <span className="legend-population">Population</span>
        <span className="legend-loss">Rolling loss</span>
      </div>
    </div>
  );
}

function OutcomeSummary({ analysis }: { analysis: SineSessionAnalysis }) {
  const outcome = analysis.outcome;
  return (
    <div className="sine-run-summary-grid">
      <Summary label="Food spawned" value={String(outcome.spawned)} />
      <Summary label="Resolved" value={String(outcome.resolved)} />
      <Summary label="Pending" value={String(outcome.pending)} />
      <Summary label="Wins" value={String(outcome.wins)} />
      <Summary label="Losses" value={String(outcome.losses)} />
      <Summary label="Avg payoff" value={outcome.averagePayoff.toFixed(3)} />
    </div>
  );
}

function EntityTables({ analysis, onInspect }: { analysis: SineSessionAnalysis; onInspect: (spawnerId: number) => void }) {
  return (
    <div className="sine-history-tables">
      <section>
        <div className="sine-history-section-title">Top Spawners</div>
        {analysis.topSpawners.slice(0, 6).map((spawner) => (
          <button type="button" key={spawner.spawnerId} onClick={() => onInspect(spawner.spawnerId)}>
            #{spawner.spawnerId} · L{spawner.lineageId} · avg {spawner.averagePayoff.toFixed(3)} · hit {(spawner.hitRate * 100).toFixed(0)}%
          </button>
        ))}
      </section>
      <section>
        <div className="sine-history-section-title">Lineages</div>
        {analysis.lineages.slice(0, 6).map((lineage) => (
          <div key={lineage.lineageId}>
            L{lineage.lineageId} · alive {lineage.livingPopulation} · born {lineage.births} · max gen {lineage.maxGeneration}
          </div>
        ))}
      </section>
      <section>
        <div className="sine-history-section-title">Most Unique</div>
        {analysis.uniqueness.mostUnique.slice(0, 6).map((score) => (
          <button type="button" key={score.spawnerId} onClick={() => onInspect(score.spawnerId)}>
            #{score.spawnerId} · score {score.score.toFixed(3)}
          </button>
        ))}
      </section>
      <section>
        <div className="sine-history-section-title">Most Typical</div>
        {analysis.uniqueness.mostTypical.slice(0, 6).map((score) => (
          <button type="button" key={score.spawnerId} onClick={() => onInspect(score.spawnerId)}>
            #{score.spawnerId} · score {score.score.toFixed(3)}
          </button>
        ))}
      </section>
    </div>
  );
}

function toPath(
  telemetry: SineSessionAnalysis["telemetry"],
  width: number,
  height: number,
  maxTick: number,
  maxValue: number,
  key: "population" | "rollingLoss",
) {
  return telemetry
    .map((point, index) => {
      const x = (point.tick / maxTick) * width;
      const y = height - (Number(point[key]) / maxValue) * (height - 12) - 6;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
