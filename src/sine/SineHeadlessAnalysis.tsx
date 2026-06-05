import { Eye, Filter, GitBranch, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getSineHeadlessAgentDetail,
  getSineHeadlessAgentLeaderboard,
  getSineHeadlessEventTimeline,
  getSineHeadlessLineages,
  getSineHeadlessTradeBreakdown,
  type SineHeadlessAgentDetailResponse,
  type SineHeadlessAgentMetrics,
  type SineHeadlessAgentSortKey,
  type SineHeadlessAliveFilter,
  type SineHeadlessEventBucket,
  type SineHeadlessLineageRow,
  type SineHeadlessTradeBreakdownResponse,
} from "./headless/headlessApi";
import type { HeadlessRunCheckpointRecord } from "./headless/types";
import { EventTimeline, BreakdownTable } from "./history/DistributionViews";
import { MiniSeriesChart } from "./history/MiniCharts";
import { formatNumber, formatPercent } from "./history/diagnosticFormatters";
import { Metric } from "./SineMetric";
import { SpawnerArchitectureModal } from "./SpawnerArchitectureModal";
import type { SpawnerAgent } from "./spawnerSimulation";

type Props = {
  runId: string;
  checkpoints: HeadlessRunCheckpointRecord[];
  checkpointIntervalTicks: number;
};

const PAGE_SIZE = 50;
const TRADE_PAGE_SIZE = 60;
type AnalysisRequestGroup = "leaderboard" | "aggregates" | "detail";

export function SineHeadlessAnalysis({ runId, checkpoints, checkpointIntervalTicks }: Props) {
  const [sortKey, setSortKey] = useState<SineHeadlessAgentSortKey>("averagePayoff");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [alive, setAlive] = useState<SineHeadlessAliveFilter>("all");
  const [minResolvedTrades, setMinResolvedTrades] = useState(10);
  const [lineageFilter, setLineageFilter] = useState<number | null>(null);
  const [agentOffset, setAgentOffset] = useState(0);
  const [agentRows, setAgentRows] = useState<SineHeadlessAgentMetrics[]>([]);
  const [agentTotal, setAgentTotal] = useState(0);
  const [lineages, setLineages] = useState<SineHeadlessLineageRow[]>([]);
  const [lineageTotal, setLineageTotal] = useState(0);
  const [events, setEvents] = useState<SineHeadlessEventBucket[]>([]);
  const [tradeBreakdown, setTradeBreakdown] = useState<SineHeadlessTradeBreakdownResponse | null>(null);
  const [selectedSpawnerId, setSelectedSpawnerId] = useState<number | null>(null);
  const [selectedTradeOffset, setSelectedTradeOffset] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<SineHeadlessAgentDetailResponse | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const [architectureSpawner, setArchitectureSpawner] = useState<SpawnerAgent | null>(null);
  const [error, setError] = useState<{ group: AnalysisRequestGroup; message: string } | null>(null);

  useEffect(() => {
    setAgentOffset(0);
  }, [alive, lineageFilter, minResolvedTrades, sortDirection, sortKey]);

  useEffect(() => {
    let cancelled = false;
    void getSineHeadlessAgentLeaderboard(runId, {
      sortKey,
      sortDirection,
      alive,
      minResolvedTrades,
      lineageId: lineageFilter,
      limit: PAGE_SIZE,
      offset: agentOffset,
    })
      .then((response) => {
        if (cancelled) return;
        setAgentRows(response.rows);
        setAgentTotal(response.total);
        clearRequestError("leaderboard");
      })
      .catch((caught) => {
        if (!cancelled) setRequestError("leaderboard", caught);
      });
    return () => {
      cancelled = true;
    };
  }, [agentOffset, alive, lineageFilter, minResolvedTrades, runId, sortDirection, sortKey]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getSineHeadlessLineages(runId, { sortKey: "cumulativePayoff", sortDirection: "desc", limit: 50 }),
      getSineHeadlessEventTimeline(runId, { interval: checkpointIntervalTicks }),
      getSineHeadlessTradeBreakdown(runId),
    ])
      .then(([lineageResponse, eventResponse, tradeResponse]) => {
        if (cancelled) return;
        setLineages(lineageResponse.rows);
        setLineageTotal(lineageResponse.total);
        setEvents(eventResponse.rows);
        setTradeBreakdown(tradeResponse);
        clearRequestError("aggregates");
      })
      .catch((caught) => {
        if (!cancelled) setRequestError("aggregates", caught);
      });
    return () => {
      cancelled = true;
    };
  }, [checkpointIntervalTicks, runId]);

  useEffect(() => {
    if (selectedSpawnerId === null) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    void getSineHeadlessAgentDetail(runId, selectedSpawnerId, {
      tradeLimit: TRADE_PAGE_SIZE,
      tradeOffset: selectedTradeOffset,
    })
      .then((response) => {
        if (cancelled) return;
        setSelectedDetail(response);
        setSelectedSnapshotIndex((index) => Math.min(index, Math.max(0, response.snapshots.length - 1)));
        clearRequestError("detail");
      })
      .catch((caught) => {
        if (!cancelled) setRequestError("detail", caught);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, selectedSpawnerId, selectedTradeOffset]);

  const selectedSnapshot = selectedDetail?.snapshots[selectedSnapshotIndex] ?? null;
  const topLineage = lineages[0] ?? null;
  const finalResolvedTrades = checkpoints.at(-1)?.resolvedTrades ?? 0;
  const coreResolvedTrades = tradeBreakdown ? tradeBreakdown.byDirection.reduce((sum, row) => sum + row.trades, 0) : 0;

  return (
    <section className="sine-headless-analysis">
      {error ? <div className="sine-error-banner">{error.message}</div> : null}

      <section className="sine-workbench-panel">
        <div className="sine-workbench-panel-head">
          <div>
            <span className="sine-eyebrow">Completed run evolution</span>
            <h2>Checkpoint Trajectory</h2>
          </div>
          <strong>{checkpoints.length} checkpoints</strong>
        </div>
        <div className="sine-analysis-chart-grid">
          <MiniSeriesChart title="Population" rows={checkpoints} value={(row) => row.population} />
          <MiniSeriesChart title="Eligible agents" rows={checkpoints} value={(row) => row.eligibleAgents} />
          <MiniSeriesChart title="Resolved trades" rows={checkpoints} value={(row) => row.resolvedTrades} />
          <MiniSeriesChart title="Hit rate" rows={checkpoints} value={(row) => row.hitRate * 100} suffix="%" />
          <MiniSeriesChart title="Average payoff" rows={checkpoints} value={(row) => row.averagePayoff} />
          <MiniSeriesChart title="Cumulative payoff" rows={checkpoints} value={(row) => row.cumulativePayoff} />
        </div>
      </section>

      <section className="sine-analysis-grid">
        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Agent population</span>
              <h2>Leaderboard</h2>
            </div>
            <strong>{agentTotal.toLocaleString()} rows</strong>
          </div>
          <div className="sine-analysis-toolbar">
            <label>
              <SlidersHorizontal size={14} />
              Sort
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SineHeadlessAgentSortKey)}>
                <option value="averagePayoff">Avg payoff</option>
                <option value="cumulativePayoff">Cumulative payoff</option>
                <option value="hitRate">Hit rate</option>
                <option value="resolvedTrades">Resolved trades</option>
                <option value="children">Children</option>
                <option value="lifespanTicks">Lifespan</option>
                <option value="generation">Generation</option>
                <option value="payoffStdDev">Payoff volatility</option>
              </select>
            </label>
            <label>
              Direction
              <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
                <option value="desc">High first</option>
                <option value="asc">Low first</option>
              </select>
            </label>
            <label>
              <Filter size={14} />
              State
              <select value={alive} onChange={(event) => setAlive(event.target.value as SineHeadlessAliveFilter)}>
                <option value="all">All</option>
                <option value="alive">Alive</option>
                <option value="dead">Dead</option>
              </select>
            </label>
            <label>
              Min trades
              <input type="number" min={0} step={10} value={minResolvedTrades} onChange={(event) => setMinResolvedTrades(Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
            </label>
          </div>
          <div className="sine-analysis-preset-row" aria-label="Leaderboard presets">
            <button type="button" onClick={() => applyPreset("average")}>Top avg payoff</button>
            <button type="button" onClick={() => applyPreset("cumulative")}>Top cumulative</button>
            <button type="button" onClick={() => applyPreset("hit")}>High hit rate</button>
            <button type="button" onClick={() => applyPreset("alive")}>Alive agents</button>
            <button type="button" onClick={() => applyPreset("lowVol")}>Low volatility</button>
            <button type="button" onClick={() => topLineage && applyPreset("lineage", topLineage.lineageId)} disabled={!topLineage}>
              Strong lineage
            </button>
          </div>
          {lineageFilter !== null ? (
            <div className="sine-analysis-filter-pill">
              Lineage L{lineageFilter}
              <button type="button" onClick={() => setLineageFilter(null)}>Clear</button>
            </div>
          ) : null}
          <AgentTable rows={agentRows} onSelect={openSelectedAgent} />
          <Pagination offset={agentOffset} limit={PAGE_SIZE} total={agentTotal} onChange={setAgentOffset} />
        </section>

        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Evolutionary families</span>
              <h2>Lineages</h2>
            </div>
            <strong>{lineageTotal.toLocaleString()} total</strong>
          </div>
          <LineageTable rows={lineages} onSelect={(lineageId) => setLineageFilter(lineageId)} />
        </section>
      </section>

      <section className="sine-analysis-grid">
        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Births, deaths, reproductions</span>
              <h2>Lifecycle Timeline</h2>
            </div>
            <strong>{checkpointIntervalTicks.toLocaleString()} tick buckets</strong>
          </div>
          <EventTimeline rows={events} />
        </section>

        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Core trade rows</span>
              <h2>Run Trade Performance</h2>
            </div>
            <strong>{coreResolvedTrades.toLocaleString()} / {finalResolvedTrades.toLocaleString()}</strong>
          </div>
          <div className="sine-ledger-scope">
            Breakdown is derived from unified core food/trade rows. Final run resolved trades are shown for coverage.
          </div>
          {tradeBreakdown ? <TradeBreakdown breakdown={tradeBreakdown} /> : <div className="sine-history-empty">Loading trade breakdown...</div>}
        </section>
      </section>

      {selectedSpawnerId !== null ? (
        <div className="sine-analysis-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedSpawnerId(null)}>
          <aside className="sine-analysis-drawer" role="dialog" aria-modal="true" aria-label={`Spawner ${selectedSpawnerId} detail`}>
            <div className="sine-workbench-panel-head">
              <div>
                <span className="sine-eyebrow">Selected agent</span>
                <h2>Spawner #{selectedSpawnerId}</h2>
              </div>
              <button type="button" onClick={() => setSelectedSpawnerId(null)}>Close</button>
            </div>
            {!selectedDetail ? (
              <div className="sine-history-empty">Loading selected agent...</div>
            ) : (
              <AgentDetail
                detail={selectedDetail}
                tradeOffset={selectedTradeOffset}
                onTradeOffsetChange={setSelectedTradeOffset}
                selectedSnapshotIndex={selectedSnapshotIndex}
                onSnapshotIndexChange={setSelectedSnapshotIndex}
                onOpenArchitecture={() => selectedSnapshot?.snapshot && setArchitectureSpawner(selectedSnapshot.snapshot)}
              />
            )}
          </aside>
        </div>
      ) : null}

      {architectureSpawner ? (
        <SpawnerArchitectureModal
          spawnerId={architectureSpawner.id}
          spawner={architectureSpawner}
          loading={false}
          modeLabel="Headless Snapshot RNN"
          onClose={() => setArchitectureSpawner(null)}
        />
      ) : null}
    </section>
  );

  function applyPreset(kind: "average" | "cumulative" | "hit" | "alive" | "lowVol" | "lineage", lineageId?: number) {
    setAlive(kind === "alive" ? "alive" : "all");
    setLineageFilter(kind === "lineage" ? lineageId ?? null : null);
    setSortDirection(kind === "lowVol" ? "asc" : "desc");
    setSortKey(
      kind === "cumulative"
        ? "cumulativePayoff"
        : kind === "hit"
          ? "hitRate"
          : kind === "lowVol"
            ? "payoffStdDev"
            : "averagePayoff",
    );
    setMinResolvedTrades(kind === "hit" || kind === "lowVol" ? 50 : 10);
  }

  function openSelectedAgent(spawnerId: number) {
    if (selectedSpawnerId === spawnerId) return;
    setSelectedSpawnerId(spawnerId);
    setSelectedTradeOffset(0);
    setSelectedSnapshotIndex(0);
    setSelectedDetail(null);
    setArchitectureSpawner(null);
  }

  function setRequestError(group: AnalysisRequestGroup, caught: unknown) {
    setError({ group, message: caught instanceof Error ? caught.message : String(caught) });
  }

  function clearRequestError(group: AnalysisRequestGroup) {
    setError((current) => (current?.group === group ? null : current));
  }
}

function AgentTable({ rows, onSelect }: { rows: SineHeadlessAgentMetrics[]; onSelect: (spawnerId: number) => void }) {
  return (
    <div className="sine-analysis-table agent-table" role="table" aria-label="Agent leaderboard">
      <div className="sine-analysis-row head" role="row">
        <span>Agent</span>
        <span>Gen</span>
        <span>Trades</span>
        <span>Hit</span>
        <span>Avg</span>
        <span>Net</span>
        <span>Kids</span>
        <span>Life</span>
        <span>Snapshots</span>
      </div>
      {rows.map((agent) => (
        <button type="button" key={agent.spawnerId} className="sine-analysis-row" role="row" onClick={() => onSelect(agent.spawnerId)}>
          <span>#{agent.spawnerId} / L{agent.lineageId}</span>
          <span>{agent.generation}</span>
          <span>{agent.resolvedTrades}</span>
          <span>{formatPercent(agent.hitRate)}</span>
          <span>{formatNumber(agent.averagePayoff)}</span>
          <span>{formatNumber(agent.cumulativePayoff)}</span>
          <span>{agent.children}</span>
          <span>{agent.lifespanTicks ?? "alive"}</span>
          <span>{agent.snapshotCount}</span>
        </button>
      ))}
      {rows.length === 0 ? <div className="sine-history-empty">No agents match these filters.</div> : null}
    </div>
  );
}

function LineageTable({ rows, onSelect }: { rows: SineHeadlessLineageRow[]; onSelect: (lineageId: number) => void }) {
  return (
    <div className="sine-analysis-table lineage-table" role="table" aria-label="Lineage leaderboard">
      <div className="sine-analysis-row head" role="row">
        <span>Lineage</span>
        <span>Agents</span>
        <span>Reconstructable</span>
        <span>Alive</span>
        <span>Trades</span>
        <span>Hit</span>
        <span>Avg</span>
        <span>Best</span>
      </div>
      {rows.map((lineage) => (
        <button type="button" key={lineage.lineageId} className="sine-analysis-row" role="row" onClick={() => onSelect(lineage.lineageId)}>
          <span>
            <GitBranch size={13} /> L{lineage.lineageId}
          </span>
          <span>{lineage.totalAgents}</span>
          <span>{lineage.eligibleAgents}</span>
          <span>{lineage.aliveAgents}</span>
          <span>{lineage.resolvedTrades}</span>
          <span>{formatPercent(lineage.hitRate)}</span>
          <span>{formatNumber(lineage.averagePayoff)}</span>
          <span>#{lineage.bestSpawnerId ?? "--"}</span>
        </button>
      ))}
    </div>
  );
}

function TradeBreakdown({ breakdown }: { breakdown: SineHeadlessTradeBreakdownResponse }) {
  return (
    <div className="sine-analysis-breakdowns">
      <BreakdownTable title="Long vs short" rows={breakdown.byDirection} />
      <BreakdownTable title="Horizon buckets" rows={breakdown.byHorizon} />
      <BreakdownTable title="Strength buckets" rows={breakdown.byStrength} />
      <BreakdownTable title="Payoff distribution" rows={breakdown.payoffBins} compact />
    </div>
  );
}

function AgentDetail({
  detail,
  tradeOffset,
  onTradeOffsetChange,
  selectedSnapshotIndex,
  onSnapshotIndexChange,
  onOpenArchitecture,
}: {
  detail: SineHeadlessAgentDetailResponse;
  tradeOffset: number;
  onTradeOffsetChange: (offset: number) => void;
  selectedSnapshotIndex: number;
  onSnapshotIndexChange: (index: number) => void;
  onOpenArchitecture: () => void;
}) {
  const metrics = detail.metrics;
  const selectedSnapshot = detail.snapshots[selectedSnapshotIndex] ?? null;
  return (
    <div className="sine-analysis-detail">
      <div className="sine-workbench-mini-grid">
        <Metric label="Lineage" value={`L${metrics.lineageId} / gen ${metrics.generation}`} />
        <Metric label="Resolved" value={metrics.resolvedTrades.toLocaleString()} />
        <Metric label="Hit rate" value={formatPercent(metrics.hitRate)} />
        <Metric label="Avg payoff" value={formatNumber(metrics.averagePayoff)} />
        <Metric label="Net payoff" value={formatNumber(metrics.cumulativePayoff)} />
        <Metric label="Children" value={String(metrics.children)} />
      </div>
      <div className="sine-analysis-section-title">Lifecycle</div>
      <div className="sine-analysis-table compact" role="table" aria-label="Selected agent lifecycle">
        {detail.events.map((event) => (
          <div key={`${event.kind}:${event.id}`} className="sine-analysis-row" role="row">
            <span>{event.kind}</span>
            <span>tick {event.tick.toLocaleString()}</span>
            <span>{event.childSpawnerId ? `child #${event.childSpawnerId}` : event.parentSpawnerId ? `parent #${event.parentSpawnerId}` : "--"}</span>
          </div>
        ))}
      </div>
      <div className="sine-analysis-section-title">Snapshots</div>
      <div className="sine-analysis-toolbar">
        <label>
          Snapshot
          <select value={selectedSnapshotIndex} onChange={(event) => onSnapshotIndexChange(Number(event.target.value))}>
            {detail.snapshots.map((snapshot, index) => (
              <option key={`${snapshot.reason}:${snapshot.tick}`} value={index}>
                {snapshot.reason} at {snapshot.tick}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!selectedSnapshot?.snapshot} onClick={onOpenArchitecture}>
          <Eye size={14} />
          Open RNN Snapshot
        </button>
      </div>
      <div className="sine-analysis-section-title">Trade Ledger</div>
      <div className="sine-analysis-table trade-table" role="table" aria-label="Selected agent trade ledger">
        <div className="sine-analysis-row head" role="row">
          <span>Food</span>
          <span>Side</span>
          <span>Ticks</span>
          <span>Signal</span>
          <span>Payoff</span>
          <span>Status</span>
        </div>
        {detail.trades.rows.map((trade) => (
          <div key={trade.foodId} className="sine-analysis-row" role="row">
            <span>#{trade.foodId}</span>
            <span>{trade.direction} x{trade.strength.toFixed(2)}</span>
            <span>{trade.spawnTick}-{trade.resolveTick} ({trade.horizonTicks})</span>
            <span>{formatNumber(trade.entrySignal)} / {trade.exitSignal === null ? "--" : formatNumber(trade.exitSignal)}</span>
            <span>{trade.payoff === null ? "--" : formatNumber(trade.payoff)}</span>
            <span>{trade.status}</span>
          </div>
        ))}
      </div>
      <Pagination offset={tradeOffset} limit={detail.trades.limit} total={detail.trades.total} onChange={onTradeOffsetChange} />
    </div>
  );
}

function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const nextOffset = Math.min(Math.max(0, total - (total % limit || limit)), offset + limit);
  return (
    <div className="sine-analysis-pagination">
      <button type="button" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
      <span>{total === 0 ? "0" : `${offset + 1}-${Math.min(total, offset + limit)}`} of {total.toLocaleString()}</span>
      <button type="button" disabled={offset + limit >= total} onClick={() => onChange(nextOffset)}>Next</button>
    </div>
  );
}
