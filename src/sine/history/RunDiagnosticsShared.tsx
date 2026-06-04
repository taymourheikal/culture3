import { HistorySummaryItem } from "./HistoryUi";
import { HistogramBars } from "./RunDiagnosticsUi";
import { SineHelpTooltip } from "../SineHelpTooltip";
import type { SineSessionAnalysis, SineSessionDiagnostics } from "./sineHistoryTypes";

export type SummaryMetric = {
  label: string;
  value: string;
  help?: string;
};

export function SummaryMetricGrid({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="sine-run-summary-grid">
      {metrics.map((metric) => (
        <HistorySummaryItem key={metric.label} label={metric.label} value={metric.value} help={metric.help} />
      ))}
    </div>
  );
}

export function Distribution({ title, help, rows }: { title: string; help?: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <div className="sine-analysis-breakdown-table">
      <div className="sine-analysis-section-title sine-analysis-title-with-help">
        {title}
        {help ? <SineHelpTooltip help={help} /> : null}
      </div>
      <HistogramBars rows={rows} valueLabel={title} />
    </div>
  );
}

export function uniqueTradeQualityOptions<T extends "minTrades" | "minAgePercentile">(
  filters: SineSessionDiagnostics["tradeQuality"]["filters"],
  key: T,
) {
  const seen = new Set<number>();
  return filters.filter((filter) => {
    const value = filter[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function comparisonMetrics(analysis: SineSessionAnalysis, formatNumber: (value: number | null | undefined) => string, formatPercent: (value: number) => string) {
  const diagnostics = analysis.diagnostics;
  const sharpe50 = diagnostics.tradeQuality.filters.find((filter) => filter.minTrades === 50 && filter.minAgePercentile === 0);
  return [
    { label: "Cumulative payoff", value: diagnostics.health.cumulativePayoff, format: formatNumber, higherBetter: true },
    { label: "Hit rate", value: diagnostics.health.hitRate, format: formatPercent, higherBetter: true },
    { label: "Avg payoff", value: diagnostics.health.averagePayoff, format: formatNumber, higherBetter: true },
    { label: "Max payoff drawdown", value: diagnostics.health.maxCumulativePayoffDrawdown, format: formatNumber, higherBetter: true },
    { label: "Worst tick payoff", value: diagnostics.health.worstSingleTickPayoff, format: formatNumber, higherBetter: true },
    { label: "Min population", value: diagnostics.health.minPopulation, format: formatNumber, higherBetter: true },
    { label: "Avg population", value: diagnostics.health.timeWeightedAveragePopulation, format: formatNumber, higherBetter: true },
    { label: "Ticks below 250", value: diagnostics.resilience.thresholdTicks.find((row) => row.threshold === 250)?.ticks ?? 0, format: formatNumber, higherBetter: false },
    { label: "Worst pop drawdown", value: diagnostics.resilience.worstPopulationDrawdown, format: formatNumber, higherBetter: true },
    { label: "Median Sharpe >=50", value: sharpe50?.sharpeSummary.median ?? 0, format: formatNumber, higherBetter: true },
    { label: "Sharpe >0.75 >=50", value: sharpe50?.agentsAboveSharpe075 ?? 0, format: formatNumber, higherBetter: true },
    { label: "Top lineage pop share", value: diagnostics.populationStructure.topLineagePopulationShare, format: formatPercent, higherBetter: false },
    { label: "Top lineage payoff share", value: diagnostics.populationStructure.topLineagePayoffShare, format: formatPercent, higherBetter: false },
  ];
}

export function winnerLabel(left: number, right: number, higherBetter: boolean, leftId: string, rightId: string, shortSessionId: (sessionId: string) => string) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) < 1e-9) return "Tie";
  const leftWins = higherBetter ? left > right : left < right;
  return shortSessionId(leftWins ? leftId : rightId);
}
