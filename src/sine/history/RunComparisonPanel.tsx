import type { SineSessionAnalysis } from "./sineHistoryTypes";
import { shortSessionId } from "./HistoryUi";
import { DiagnosticsPanel, formatNumber, formatPercent } from "./RunDiagnosticsUi";
import { comparisonMetrics, winnerLabel } from "./RunDiagnosticsShared";

export function RunComparisonPanel({ primary, comparison }: { primary: SineSessionAnalysis; comparison: SineSessionAnalysis }) {
  const primaryMetrics = comparisonMetrics(primary, formatNumber, formatPercent);
  const comparisonMetricsRows = comparisonMetrics(comparison, formatNumber, formatPercent);
  return (
    <DiagnosticsPanel
      title="Run Comparison"
      eyebrow="Two-run diagnostics"
      stat={`${shortSessionId(primary.session.id)} vs ${shortSessionId(comparison.session.id)}`}
    >
      <div className="sine-run-comparison-table" role="table" aria-label="Run comparison">
        <div className="sine-run-comparison-row head" role="row">
          <span>Metric</span>
          <span>{shortSessionId(primary.session.id)}</span>
          <span>{shortSessionId(comparison.session.id)}</span>
          <span>Better</span>
        </div>
        {primaryMetrics.map((metric, index) => {
          const other = comparisonMetricsRows[index] ?? metric;
          const winner = winnerLabel(metric.value, other.value, metric.higherBetter, primary.session.id, comparison.session.id, shortSessionId);
          return (
            <div key={metric.label} className="sine-run-comparison-row" role="row">
              <span>{metric.label}</span>
              <span>{metric.format(metric.value)}</span>
              <span>{other.format(other.value)}</span>
              <strong>{winner}</strong>
            </div>
          );
        })}
      </div>
    </DiagnosticsPanel>
  );
}
