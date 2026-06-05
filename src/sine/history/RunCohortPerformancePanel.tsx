import { useEffect, useRef, useState } from "react";
import { getSineSessionCohortAnalysis } from "./sineHistoryApi";
import type { SineCohortTimelineBucket, SineSessionAnalysis, SineSessionCohortAnalysis, SineSessionDiagnostics } from "./sineHistoryTypes";
import { MiniCompositeChart } from "./MiniCharts";
import { formatNumber, formatPercent } from "./diagnosticFormatters";
import { SummaryMetricGrid } from "./RunDiagnosticsShared";

export function RunCohortPerformancePanel({
  analysis,
  selected,
}: {
  analysis: SineSessionAnalysis;
  selected: SineSessionDiagnostics["tradeQuality"]["filters"][number];
}) {
  const [cohort, setCohort] = useState<SineSessionCohortAnalysis | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const requestId = useRef(0);
  const range = analysis.diagnostics.range;

  useEffect(() => {
    let cancelled = false;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setStatus("loading");
    getSineSessionCohortAnalysis(analysis.session.id, {
      fromPercent: range.fromPercent,
      toPercent: range.toPercent,
      minTrades: selected.minTrades,
      minAgePercentile: selected.minAgePercentile,
      bucketCount: 100,
    })
      .then((next) => {
        if (cancelled || requestId.current !== currentRequest) return;
        setCohort(next);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled || requestId.current !== currentRequest) return;
        setCohort(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [analysis.session.id, range.fromPercent, range.toPercent, selected.minAgePercentile, selected.minTrades]);

  return (
    <div className="sine-cohort-panel">
      <div className="sine-analysis-section-title">Filtered Cohort Performance</div>
      {status === "loading" ? (
        <div className="sine-analysis-chart-empty">Loading cohort performance...</div>
      ) : status === "error" || !cohort ? (
        <div className="sine-analysis-chart-empty">Cohort performance is unavailable for this saved run.</div>
      ) : (
        <>
          <SummaryMetricGrid
            metrics={[
              { label: "Eligible agents", value: cohort.filter.eligibleAgents.toLocaleString() },
              { label: "Active agents", value: cohort.concentration.activeAgents.toLocaleString() },
              { label: "Cohort trades", value: cohort.concentration.totalTrades.toLocaleString() },
              { label: "Bucket coverage", value: formatPercent(cohort.concentration.activeBucketCoverage) },
              { label: "Top-agent trade share", value: formatPercent(cohort.concentration.topAgentTradeShare) },
              { label: "Top-agent abs payoff share", value: formatPercent(cohort.concentration.topAgentAbsolutePayoffShare) },
              { label: "Top-lineage trade share", value: formatPercent(cohort.concentration.topLineageTradeShare) },
              { label: "Timing overlap", value: formatPercent(cohort.concentration.timingOverlapScore) },
              { label: "Regime source", value: cohort.market.regimeStatus },
            ]}
          />
          {cohort.filter.eligibleAgents === 0 ? (
            <div className="sine-analysis-chart-empty">No agents match the current Trade Quality filters.</div>
          ) : cohort.concentration.totalTrades === 0 ? (
            <div className="sine-analysis-chart-empty">Eligible agents had no resolved trades in the selected tick range.</div>
          ) : (
            <div className="sine-cohort-grid">
              <CohortTimelineChart rows={cohort.timeline} />
              <CohortRegimeGrid cohort={cohort} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CohortTimelineChart({ rows }: { rows: SineCohortTimelineBucket[] }) {
  const maxTrades = Math.max(1, ...rows.map((row) => row.trades));
  const chartRows = rows.map((row) => ({ ...row, tick: row.bucketStartTick }));
  return (
    <MiniCompositeChart
      title="Cohort trading timeline"
      rows={chartRows}
      width={640}
      height={180}
      plotTop={18}
      plotBottom={156}
      className="sine-cohort-timeline"
      ariaLabel="Filtered cohort trading timeline"
      xValue={(_row, index) => index}
      centerSinglePoint
      showHoverOnDefault={false}
      series={[{ label: "Cumulative payoff", value: (row) => row.cumulativePayoff }]}
      domainValues={(row) => [row.drawdown]}
      bars={{
        value: (row) => row.trades,
        maxValue: maxTrades,
        maxHeight: 42,
        className: (row) => (row.totalPayoff >= 0 ? "positive" : "negative"),
      }}
      formatReadout={(row) =>
        `T${row.bucketStartTick}-${row.bucketEndTick} · ${row.trades.toLocaleString()} trades · ${formatPercent(row.hitRate ?? 0)} hit · ${formatNumber(row.totalPayoff)} payoff`
      }
      emptyReadout="No cohort trades"
    />
  );
}

function CohortRegimeGrid({ cohort }: { cohort: SineSessionCohortAnalysis }) {
  const trends: SineSessionCohortAnalysis["regimeGrid"][number]["trend"][] = ["up", "flat", "down", "unknown"];
  const volatilities: SineSessionCohortAnalysis["regimeGrid"][number]["volatility"][] = ["low", "medium", "high", "unknown"];
  const maxTrades = Math.max(1, ...cohort.regimeGrid.map((cell) => cell.trades));
  return (
    <div className="sine-analysis-mini-chart sine-cohort-regime-grid">
      <div className="sine-analysis-mini-chart-head">
        <span className="sine-analysis-title-with-help">Regime performance grid</span>
        <strong>{cohort.market.regimeStatus}</strong>
      </div>
      <div className="sine-cohort-regime-table" role="table" aria-label="Cohort performance by regime">
        <span />
        {volatilities.map((volatility) => <strong key={volatility}>{volatility}</strong>)}
        {trends.flatMap((trend) => [
          <strong key={`${trend}-label`}>{trend}</strong>,
          ...volatilities.map((volatility) => {
            const cell = cohort.regimeGrid.find((row) => row.trend === trend && row.volatility === volatility);
            const trades = cell?.trades ?? 0;
            const payoff = cell?.averagePayoff ?? 0;
            const sampled = trades > 0;
            return (
              <div
                key={`${trend}-${volatility}`}
                className={!sampled ? "empty" : payoff >= 0 ? "positive" : "negative"}
                style={{ opacity: sampled ? 0.35 + 0.65 * (trades / maxTrades) : undefined }}
              >
                {sampled ? (
                  <>
                    <span>{trades.toLocaleString()} trades</span>
                    <strong>{formatPercent(cell?.hitRate ?? 0)}</strong>
                    <small>{formatNumber(payoff)}</small>
                  </>
                ) : (
                  <>
                    <span>No trades</span>
                    <strong>--</strong>
                    <small>--</small>
                  </>
                )}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}
