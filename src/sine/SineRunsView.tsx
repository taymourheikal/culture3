import { RotateCcw, Square, FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MarketControlGroups } from "./controls/MarketControlGroups";
import { SpawnerControlGroups } from "./controls/SpawnerControlGroups";
import {
  cancelSineHeadlessRun,
  getActiveSineHeadlessRuns,
  getLatestSineHeadlessRun,
  startSineHeadlessRun,
  type SineHeadlessCounts,
  type SineHeadlessJob,
  type SineHeadlessRunRow,
} from "./headless/headlessApi";
import type { HeadlessRunCheckpointRecord } from "./headless/types";
import { sanitizeMarketRuntimeConfig, type MarketDataSource, type MarketPlaybackSettings, type MarketRuntimeConfig } from "./marketRuntimeConfig";
import type { WaveSettings } from "./marketSignal";
import {
  loadSavedLabDefaultsForRuns,
  loadSavedRunsDefaults,
  saveRunsExecutionDefaults,
  saveRunsMarketSettingsGroup,
  saveRunsMarketSourceDefault,
  saveRunsPlaybackSettingsGroup,
  saveRunsSpawnerConfigGroup,
} from "./runsSettingsStorage";
import type { SpawnerConfig } from "./spawnerSimulation";
import { sanitizeSpawnerConfig } from "./spawnerSettingsStorage";
import { Metric } from "./SineMetric";
import type { SineView } from "./SineApp";
import { SineHeader } from "./SineHeader";
import { SineHelpTooltip } from "./SineHelpTooltip";
import { SineHeadlessAnalysis } from "./SineHeadlessAnalysis";

type RunDraft = {
  ticks: number;
  seed: number;
  minimumResolvedTrades: number;
  resolvedTradeSnapshotInterval: number;
  checkpointIntervalTicks: number;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
};

const RUN_CONTROL_HELP = {
  ticks: "Maximum run length in simulation ticks. The run stops at this target unless population hits 0 or the market data ends first.",
  checkpointIntervalTicks: "How often the headless worker writes progress checkpoints for the Runs UI and saved run summaries.",
  minimumResolvedTrades: "Seed-bank reconstruction threshold: an agent becomes eligible for rich persisted snapshots after this many resolved trades.",
  resolvedTradeSnapshotInterval: "For eligible/candidate agents, save an extra reconstruction snapshot after every N resolved trades. 0 disables trade-interval snapshots.",
  seed: "Deterministic random seed for founder creation, mutation, reproduction, and other seeded simulation randomness.",
} as const;

export function SineRunsView({
  activeView,
  onViewChange,
}: {
  activeView: SineView;
  onViewChange: (view: SineView) => void;
}) {
  const [draft, setDraft] = useState<RunDraft>(() => createDraft());
  const [savedGroup, setSavedGroup] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<SineHeadlessJob[]>([]);
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState(2);
  const [run, setRun] = useState<SineHeadlessRunRow | null>(null);
  const [checkpoints, setCheckpoints] = useState<HeadlessRunCheckpointRecord[]>([]);
  const [counts, setCounts] = useState<SineHeadlessCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"start" | `cancel:${string}` | null>(null);

  useEffect(() => {
    let cancelled = false;
    const applyLatestRun = async () => {
      const latest = await getLatestSineHeadlessRun();
      if (cancelled || !latest.run) return;
      setActiveJobs([]);
      setRun(latest.run);
      setCheckpoints(latest.checkpoints);
      setCounts(latest.counts);
    };
    void getActiveSineHeadlessRuns()
      .then((response) => {
        if (cancelled) return;
        setMaxConcurrentRuns(response.maxConcurrentRuns);
        setActiveJobs(sortJobs(response.jobs));
        if (response.jobs.length === 0) {
          void applyLatestRun().catch((caught) => {
            if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
          });
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    let cancelled = false;
    let timeout: number | null = null;
    const poll = () => {
      void getActiveSineHeadlessRuns()
        .then((response) => {
          if (cancelled) return;
          setMaxConcurrentRuns(response.maxConcurrentRuns);
          setActiveJobs(sortJobs(response.jobs));
          if (response.jobs.length > 0) {
            timeout = window.setTimeout(poll, 1000);
            return;
          }
          void getLatestSineHeadlessRun()
            .then((latest) => {
              if (cancelled) return;
              setRun(latest.run);
              setCheckpoints(latest.checkpoints);
              setCounts(latest.counts);
            })
            .catch((caught) => {
              if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
            });
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        });
    };
    poll();
    return () => {
      cancelled = true;
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [activeJobs.length]);

  const marketSettings = draft.marketConfig.generated;
  const capacityFull = activeJobs.length >= maxConcurrentRuns;
  const canStart = pendingAction === null && !capacityFull;

  const restoreLabSettings = () => {
    const savedLab = loadSavedLabDefaultsForRuns();
    setDraft((current) => ({
      ...current,
      marketConfig: sanitizeMarketRuntimeConfig(savedLab.marketConfig),
      spawnerConfig: sanitizeSpawnerConfig(savedLab.spawnerConfig),
    }));
    setSavedGroup("runs:restored-lab");
  };

  const updateSetting = <K extends keyof WaveSettings>(key: K, value: WaveSettings[K]) => {
    setDraft((current) => ({
      ...current,
      marketConfig: sanitizeMarketRuntimeConfig({
        ...current.marketConfig,
        generated: { ...current.marketConfig.generated, [key]: value },
      }),
    }));
  };

  const updatePlaybackSetting = <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => {
    setDraft((current) => ({
      ...current,
      marketConfig: sanitizeMarketRuntimeConfig({
        ...current.marketConfig,
        playback: { ...current.marketConfig.playback, [key]: value },
      }),
    }));
  };

  const updateMarketSource = (source: MarketDataSource) => {
    setDraft((current) => ({ ...current, marketConfig: sanitizeMarketRuntimeConfig({ ...current.marketConfig, source }) }));
  };

  const replaceMarketConfig = (marketConfig: MarketRuntimeConfig) => {
    setDraft((current) => ({ ...current, marketConfig: sanitizeMarketRuntimeConfig(marketConfig) }));
  };

  const updateSpawnerConfig = <K extends keyof SpawnerConfig>(key: K, value: SpawnerConfig[K]) => {
    setDraft((current) => ({ ...current, spawnerConfig: sanitizeSpawnerConfig({ ...current.spawnerConfig, [key]: value }) }));
  };

  const replaceSpawnerConfig = (spawnerConfig: SpawnerConfig) => {
    setDraft((current) => ({ ...current, spawnerConfig: sanitizeSpawnerConfig(spawnerConfig) }));
  };

  const startRun = async () => {
    if (pendingAction !== null) return;
    setPendingAction("start");
    try {
      setError(null);
      setRun(null);
      setCheckpoints([]);
      setCounts(null);
      const response = await startSineHeadlessRun({
        ticks: draft.ticks,
        seed: draft.seed,
        marketConfig: draft.marketConfig,
        spawnerConfig: draft.spawnerConfig,
        minimumResolvedTrades: draft.minimumResolvedTrades,
        resolvedTradeSnapshotInterval: draft.resolvedTradeSnapshotInterval,
        checkpointIntervalTicks: draft.checkpointIntervalTicks,
      });
      setActiveJobs((current) => sortJobs(upsertJob(current, response.job)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const cancelRun = async (job: SineHeadlessJob) => {
    if (pendingAction !== null) return;
    setPendingAction(`cancel:${job.runId}`);
    try {
      setError(null);
      const response = await cancelSineHeadlessRun(job.runId);
      setActiveJobs((current) => sortJobs(upsertJob(current, response.job)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="sine-shell sine-runs-shell">
      <SineHeader activeView={activeView} currentSignal={0} showReadout={false} onViewChange={onViewChange} />
      {error ? <div className="sine-error-banner">{error}</div> : null}

      <section className="sine-runs-main">
        <section className="sine-workbench-panel emphasis">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Headless experiment</span>
              <h2>{activeJobs.length > 0 ? "Active runs" : run?.id ?? "Not started"}</h2>
            </div>
            <strong>{activeJobs.length > 0 ? `${activeJobs.length}/${maxConcurrentRuns} active` : run?.status ?? "idle"}</strong>
          </div>
          {activeJobs.length > 0 ? (
            <div className="sine-headless-run-list">
              {activeJobs.map((activeJob) => (
                <HeadlessRunCard
                  key={activeJob.runId}
                  job={activeJob}
                  draftTicks={draft.ticks}
                  counts={null}
                  checkpoints={[]}
                  pendingAction={pendingAction}
                  onCancel={cancelRun}
                />
              ))}
            </div>
          ) : (
            <HeadlessRunCard job={null} run={run} draftTicks={draft.ticks} checkpoints={checkpoints} counts={counts} pendingAction={pendingAction} />
          )}
          <div className="sine-workbench-actions">
            <button type="button" onClick={startRun} disabled={!canStart}>
              <FlaskConical size={15} />
              {pendingAction === "start" ? "Starting" : "Start"}
            </button>
            {capacityFull ? <span className="sine-muted">Capacity full</span> : null}
          </div>
        </section>

        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Run controls</span>
              <h2>Execution</h2>
            </div>
            {savedGroup === "runs:execution" ? <div className="saved-defaults">Saved defaults</div> : null}
          </div>
          <div className="sine-runs-fields">
            <NumberField label="Run length" value={draft.ticks} min={0} step={1000} suffix="ticks" disabled={!canStart} help={RUN_CONTROL_HELP.ticks} onChange={(ticks) => setDraft((current) => ({ ...current, ticks }))} />
            <NumberField label="Checkpoint interval" value={draft.checkpointIntervalTicks} min={1} step={1000} suffix="ticks" disabled={!canStart} help={RUN_CONTROL_HELP.checkpointIntervalTicks} onChange={(checkpointIntervalTicks) => setDraft((current) => ({ ...current, checkpointIntervalTicks }))} />
            <NumberField label="Minimum resolved trades" value={draft.minimumResolvedTrades} min={0} step={1} disabled={!canStart} help={RUN_CONTROL_HELP.minimumResolvedTrades} onChange={(minimumResolvedTrades) => setDraft((current) => ({ ...current, minimumResolvedTrades }))} />
            <NumberField label="Resolved trade snapshot interval" value={draft.resolvedTradeSnapshotInterval} min={0} step={1} suffix="trades" disabled={!canStart} help={RUN_CONTROL_HELP.resolvedTradeSnapshotInterval} onChange={(resolvedTradeSnapshotInterval) => setDraft((current) => ({ ...current, resolvedTradeSnapshotInterval }))} />
            <NumberField label="Seed" value={draft.seed} min={0} step={1} disabled={!canStart} help={RUN_CONTROL_HELP.seed} onChange={(seed) => setDraft((current) => ({ ...current, seed }))} />
          </div>
          <div className="sine-workbench-actions">
            <button
              type="button"
              onClick={() => {
                saveRunsExecutionDefaults(draft);
                setSavedGroup("runs:execution");
              }}
              disabled={!canStart}
            >
              Save Execution Defaults
            </button>
          </div>
        </section>

        {activeJobs.length === 0 && run && checkpoints.length > 0 ? (
          <SineHeadlessAnalysis
            runId={run.id}
            checkpoints={checkpoints}
            checkpointIntervalTicks={run.checkpoint_interval_ticks ?? draft.checkpointIntervalTicks}
          />
        ) : null}
      </section>

      <aside className="sine-runs-settings">
        <section className="sine-controls">
          <button type="button" className="sine-button primary" onClick={restoreLabSettings} disabled={!canStart}>
            <RotateCcw size={15} />
            Restore Lab Settings
          </button>
          <div className="sine-control-panel-scroll">
            <MarketControlGroups
              settings={marketSettings}
              marketConfig={draft.marketConfig}
              savedGroup={savedGroup}
              setSavedGroup={setSavedGroup}
              updateSetting={updateSetting}
              updatePlaybackSetting={updatePlaybackSetting}
              updateMarketSource={updateMarketSource}
              replaceMarketConfig={replaceMarketConfig}
              showSaveActions
              showPlaybackEndControls={false}
              saveMarketSource={saveRunsMarketSourceDefault}
              savePlaybackSettings={saveRunsPlaybackSettingsGroup}
              saveMarketSettings={saveRunsMarketSettingsGroup}
            />
            <SpawnerControlGroups
              spawnerConfig={draft.spawnerConfig}
              stats={null}
              savedGroup={savedGroup}
              setSavedGroup={setSavedGroup}
              updateSpawnerConfig={updateSpawnerConfig}
              replaceSpawnerConfig={replaceSpawnerConfig}
              showSaveActions
              saveSpawnerGroup={saveRunsSpawnerConfigGroup}
            />
          </div>
        </section>
      </aside>
    </main>
  );
}

function HeadlessRunCard({
  job,
  run,
  draftTicks,
  checkpoints,
  counts,
  pendingAction,
  onCancel,
}: {
  job: SineHeadlessJob | null;
  run?: SineHeadlessRunRow | null;
  draftTicks: number;
  checkpoints: HeadlessRunCheckpointRecord[];
  counts: SineHeadlessCounts | null;
  pendingAction: "start" | `cancel:${string}` | null;
  onCancel?: (job: SineHeadlessJob) => void;
}) {
  const latestCheckpoint = job ? job.latestCheckpoint : checkpoints[checkpoints.length - 1] ?? null;
  const progressTick = job?.tick ?? run?.tick ?? latestCheckpoint?.tick ?? 0;
  const targetTicks = job?.targetTicks ?? run?.target_ticks ?? draftTicks;
  const progress = targetTicks > 0 ? Math.max(0, Math.min(1, progressTick / targetTicks)) : 1;
  const statusLabel = job?.status ?? run?.status ?? "idle";
  const runId = job?.runId ?? run?.id ?? "Not started";
  const timing = job?.timing ?? null;
  const cancelPending = job ? pendingAction === `cancel:${job.runId}` : false;
  const canCancel = !!job && pendingAction === null && !isTerminalStatus(job.status) && !job.cancelRequested;
  const headlineStats = useMemo<Array<[string, string]>>(
    () => [
      ["Population", latestCheckpoint ? String(latestCheckpoint.population) : job?.population !== null && job?.population !== undefined ? String(job.population) : "--"],
      ["Eligible", latestCheckpoint ? String(latestCheckpoint.eligibleAgents) : "--"],
      ["Hit rate", latestCheckpoint ? `${(latestCheckpoint.hitRate * 100).toFixed(1)}%` : "--"],
      ["Avg payoff", latestCheckpoint ? latestCheckpoint.averagePayoff.toFixed(3) : "--"],
      ["Net payoff", latestCheckpoint ? latestCheckpoint.cumulativePayoff.toFixed(2) : "--"],
      ["Trades", latestCheckpoint ? String(latestCheckpoint.resolvedTrades) : counts ? String(counts.trades) : "--"],
    ],
    [counts, job?.population, latestCheckpoint],
  );

  return (
    <article className="sine-headless-run-card">
      <div className="sine-workbench-panel-head compact">
        <div>
          <span className="sine-eyebrow">Run</span>
          <h3>{runId}</h3>
        </div>
        <strong>{statusLabel}</strong>
      </div>
      <div className="sine-run-progress" aria-label={`${runId} progress`}>
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Tick" value={`${progressTick.toLocaleString()} / ${targetTicks.toLocaleString()}`} />
        <Metric label="Checkpoints" value={String(job ? (job.latestCheckpoint ? 1 : 0) : checkpoints.length)} />
        <Metric label="Interval" value={`${(job?.checkpointIntervalTicks ?? run?.checkpoint_interval_ticks ?? "--").toLocaleString()} ticks`} />
        <Metric label="Stop reason" value={job ? job.terminationReason ?? "--" : runStopReason(run?.termination_reason, run?.status)} />
      </div>
      <div className="sine-workbench-mini-grid">
        {headlineStats.map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </div>
      {timing ? (
        <div className="sine-workbench-mini-grid">
          <Metric label="Ticks/sec" value={formatRate(timing.latestChunk?.ticksPerSecond)} />
          <Metric label="Chunk ms" value={formatMs(timing.latestChunk?.chunkMs)} />
          <Metric label="Advance ms" value={formatMs(timing.latestChunk?.advanceTotalMs)} />
          <Metric label="Recorder ms" value={formatMs(timing.latestChunk?.recorderEventMs)} />
          <Metric label="DB/write ms" value={formatMs(timing.latestChunk?.sinkWriteMs)} />
          <Metric label="Enqueue ms" value={formatMs(timing.latestChunk?.sinkEnqueueMs)} />
          <Metric label="Flush ms" value={formatMs(timing.latestChunk?.sinkFlushMs)} />
          <Metric label="Flushed rows" value={formatInteger(timing.latestChunk?.sinkBufferedRows)} />
          <Metric label="Core est ms" value={formatMs(timing.latestChunk?.simulationCoreEstimateMs)} />
          <Metric label="Top write" value={formatSinkMethod(timing.topSinkMethod)} />
        </div>
      ) : null}
      {job ? (
        <div className="sine-workbench-actions">
          <button type="button" onClick={() => onCancel?.(job)} disabled={!canCancel}>
            <Square size={15} />
            {cancelPending ? "Cancelling" : "Cancel"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  suffix,
  disabled,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  suffix?: string;
  disabled: boolean;
  help?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sine-select-field">
      <span>
        {label}
        {help ? <SineHelpTooltip help={help} /> : null}
      </span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(min, Math.floor(Number(event.target.value) || min)))}
      />
      {suffix ? <small>{suffix}</small> : null}
    </label>
  );
}

function createDraft(): RunDraft {
  const saved = loadSavedRunsDefaults();
  return {
    ticks: saved.ticks,
    seed: saved.seed,
    minimumResolvedTrades: saved.minimumResolvedTrades,
    resolvedTradeSnapshotInterval: saved.resolvedTradeSnapshotInterval,
    checkpointIntervalTicks: saved.checkpointIntervalTicks,
    marketConfig: saved.marketConfig,
    spawnerConfig: saved.spawnerConfig,
  };
}

function upsertJob(jobs: SineHeadlessJob[], job: SineHeadlessJob) {
  const next = jobs.filter((candidate) => candidate.runId !== job.runId);
  next.push(job);
  return next;
}

function sortJobs(jobs: SineHeadlessJob[]) {
  return [...jobs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function isTerminalStatus(status: string) {
  return status === "completed" || status === "cancelled" || status === "failed";
}

function runStopReason(reason: string | null | undefined, status: string | undefined) {
  if (reason) return reason;
  if (status === "completed") return "target/end";
  if (status === "cancelled") return "cancelled";
  if (status === "failed") return "failed";
  return "--";
}

function formatMs(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "--";
  return `${Number(value).toFixed(Number(value) >= 100 ? 0 : 1)} ms`;
}

function formatRate(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "--";
  return `${Number(value).toFixed(Number(value) >= 100 ? 0 : 1)} t/s`;
}

function formatInteger(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "--";
  return Math.floor(Number(value)).toLocaleString();
}

function formatSinkMethod(method: { method: string; ms: number; calls: number } | null | undefined) {
  if (!method) return "--";
  return `${method.method} ${formatMs(method.ms)} / ${method.calls}`;
}
