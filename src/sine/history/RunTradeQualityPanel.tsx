import { useMemo, useState } from "react";
import type { SineSessionAnalysis, SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel, formatNumber } from "./RunDiagnosticsUi";
import { Distribution, SummaryMetricGrid, uniqueTradeQualityOptions } from "./RunDiagnosticsShared";
import { RunCohortPerformancePanel } from "./RunCohortPerformancePanel";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunTradeQualityPanel({ analysis, diagnostics }: { analysis: SineSessionAnalysis; diagnostics: SineSessionDiagnostics }) {
  const [minTrades, setMinTrades] = useState(50);
  const [minAgePercentile, setMinAgePercentile] = useState(0);
  const tradeOptions = useMemo(() => uniqueTradeQualityOptions(diagnostics.tradeQuality.filters, "minTrades"), [diagnostics.tradeQuality.filters]);
  const ageOptions = useMemo(() => uniqueTradeQualityOptions(diagnostics.tradeQuality.filters, "minAgePercentile"), [diagnostics.tradeQuality.filters]);
  const selected = useMemo(
    () =>
      diagnostics.tradeQuality.filters.find((filter) => filter.minTrades === minTrades && filter.minAgePercentile === minAgePercentile) ??
      diagnostics.tradeQuality.filters.find((filter) => filter.minTrades === minTrades && filter.minAgePercentile === 0) ??
      diagnostics.tradeQuality.filters[0],
    [diagnostics.tradeQuality.filters, minAgePercentile, minTrades],
  );
  if (!selected) return null;
  return (
    <DiagnosticsPanel title="Trade Quality Distributions" eyebrow="Per-agent trade-level quality" stat={selected.label}>
      <div className="sine-analysis-toolbar">
        <label>
          Sample
          <select value={minTrades} onChange={(event) => setMinTrades(Number(event.target.value))}>
            {tradeOptions.map((filter) => (
              <option key={filter.minTrades} value={filter.minTrades}>{filter.label}</option>
            ))}
          </select>
        </label>
        <label>
          Age
          <select value={minAgePercentile} onChange={(event) => setMinAgePercentile(Number(event.target.value))}>
            {ageOptions.map((filter) => (
              <option key={filter.minAgePercentile} value={filter.minAgePercentile}>{filter.ageLabel}</option>
            ))}
          </select>
        </label>
      </div>
      <SummaryMetricGrid
        metrics={[
          { label: "Eligible agents", value: selected.eligibleAgents.toLocaleString() },
          { label: "Undefined Sharpe", value: selected.undefinedSharpeAgents.toLocaleString(), help: RUN_DIAGNOSTIC_HELP.sharpe },
          { label: "Sharpe median", value: formatNumber(selected.sharpeSummary.median), help: RUN_DIAGNOSTIC_HELP.sharpe },
          { label: "Sharpe > 0.75", value: selected.agentsAboveSharpe075.toLocaleString(), help: RUN_DIAGNOSTIC_HELP.sharpe },
          { label: "Undefined Sortino", value: selected.undefinedSortinoAgents.toLocaleString(), help: RUN_DIAGNOSTIC_HELP.sortino },
          { label: "Sortino median", value: formatNumber(selected.sortinoSummary.median), help: RUN_DIAGNOSTIC_HELP.sortino },
          { label: "Sortino > 0.75", value: selected.agentsAboveSortino075.toLocaleString(), help: RUN_DIAGNOSTIC_HELP.sortino },
          { label: "Downside vol median", value: formatNumber(selected.downsideVolatilitySummary.median), help: RUN_DIAGNOSTIC_HELP.downsideVolatility },
          { label: "Age threshold", value: selected.minAgePercentile === 0 ? "None" : `${formatNumber(selected.minAgeTicks)} ticks`, help: RUN_DIAGNOSTIC_HELP.agentAge },
        ]}
      />
      <div className="sine-run-distribution-grid">
        <Distribution title="Trade-level Sharpe" help={RUN_DIAGNOSTIC_HELP.sharpe} rows={selected.sharpeHistogram} />
        <Distribution title="Trade-level Sortino" help={RUN_DIAGNOSTIC_HELP.sortino} rows={selected.sortinoHistogram} />
        <Distribution title="Downside volatility" help={RUN_DIAGNOSTIC_HELP.downsideVolatility} rows={selected.downsideVolatilityHistogram} />
        <Distribution title="Average payoff" rows={selected.averagePayoffHistogram} />
        <Distribution title="Hit rate" rows={selected.hitRateHistogram} />
        <Distribution title="Resolved trades" rows={selected.resolvedTradesHistogram} />
      </div>
      <RunCohortPerformancePanel analysis={analysis} selected={selected} />
    </DiagnosticsPanel>
  );
}
