import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { MiniSeriesChart } from "./MiniCharts";
import { formatNumber } from "./diagnosticFormatters";
import { SummaryMetricGrid } from "./RunDiagnosticsShared";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunTradingPerformancePanel({ diagnostics }: { diagnostics: SineSessionDiagnostics }) {
  const performance = diagnostics.tradingPerformance;
  const bucketRows = performance.bucketSeries.map((row) => ({ ...row, tick: row.bucketStartTick }));
  return (
    <DiagnosticsPanel title="Trading Performance" eyebrow="Resolved opportunity performance" stat={`${diagnostics.health.resolvedTrades.toLocaleString()} trades`}>
      <div className="sine-analysis-chart-grid">
        <MiniSeriesChart title="Cumulative payoff" help={RUN_DIAGNOSTIC_HELP.cumulativePayoff} rows={performance.cumulativePayoffSeries} value={(row) => row.cumulativePayoff} />
        <MiniSeriesChart title="Drawdown" help={RUN_DIAGNOSTIC_HELP.payoffDrawdown} rows={performance.cumulativePayoffSeries} value={(row) => row.drawdown} strokeClassName="negative" />
        <MiniSeriesChart title="Bucket hit rate" help={RUN_DIAGNOSTIC_HELP.bucketHitRate} rows={bucketRows} value={(row) => row.hitRate * 100} suffix="%" />
        <MiniSeriesChart title="Bucket avg payoff" help={RUN_DIAGNOSTIC_HELP.bucketAveragePayoff} rows={bucketRows} value={(row) => row.averagePayoff} />
      </div>
      <SummaryMetricGrid
        metrics={[
          { label: "Max payoff drawdown", value: formatNumber(performance.maxCumulativePayoffDrawdown), help: RUN_DIAGNOSTIC_HELP.payoffDrawdown },
          { label: "Worst tick payoff", value: formatNumber(performance.worstSingleTickPayoff) },
          { label: "Worst bucket", value: performance.worstBucket ? `${performance.worstBucket.bucketStartTick}-${performance.worstBucket.bucketEndTick}` : "--" },
          { label: "Worst bucket payoff", value: formatNumber(performance.worstBucket?.totalPayoff) },
          { label: "Bucket downside vol", value: formatNumber(performance.bucketDownsideVolatility), help: RUN_DIAGNOSTIC_HELP.bucketDownsideVolatility },
          { label: "Bucket VaR 5%", value: formatNumber(performance.bucketVaR5), help: RUN_DIAGNOSTIC_HELP.bucketVaR5 },
          { label: "Bucket CVaR 5%", value: formatNumber(performance.bucketCVaR5), help: RUN_DIAGNOSTIC_HELP.bucketCVaR5 },
          { label: "Bucket VaR 1%", value: formatNumber(performance.bucketVaR1), help: RUN_DIAGNOSTIC_HELP.bucketVaR1 },
          { label: "Bucket CVaR 1%", value: formatNumber(performance.bucketCVaR1), help: RUN_DIAGNOSTIC_HELP.bucketCVaR1 },
        ]}
      />
    </DiagnosticsPanel>
  );
}
