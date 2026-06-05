import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { BreakdownTable } from "./DistributionViews";
import { formatNumber } from "./diagnosticFormatters";
import { Distribution, SummaryMetricGrid } from "./RunDiagnosticsShared";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunRiskTailPanel({ diagnostics }: { diagnostics: SineSessionDiagnostics }) {
  const risk = diagnostics.riskTail;
  return (
    <DiagnosticsPanel title="Risk / Tail Profile" eyebrow="Trade outcome distribution" stat={`avg abs ${formatNumber(risk.averageAbsolutePayoff)}`}>
      <SummaryMetricGrid
        metrics={[
          { label: "Worst 1%", value: formatNumber(risk.worst1PctPayoff) },
          { label: "Worst 5%", value: formatNumber(risk.worst5PctPayoff) },
          { label: "Worst 10%", value: formatNumber(risk.worst10PctPayoff) },
          { label: "Best 10%", value: formatNumber(risk.best10PctPayoff) },
          { label: "Best 5%", value: formatNumber(risk.best5PctPayoff) },
          { label: "Best 1%", value: formatNumber(risk.best1PctPayoff) },
          { label: "Trade downside vol", value: formatNumber(risk.tradeDownsideVolatility), help: RUN_DIAGNOSTIC_HELP.downsideVolatility },
          { label: "Trade VaR 5%", value: formatNumber(risk.tradeVaR5), help: RUN_DIAGNOSTIC_HELP.tradeVaR5 },
          { label: "Trade CVaR 5%", value: formatNumber(risk.tradeCVaR5), help: RUN_DIAGNOSTIC_HELP.tradeCVaR5 },
          { label: "Trade VaR 1%", value: formatNumber(risk.tradeVaR1), help: RUN_DIAGNOSTIC_HELP.tradeVaR1 },
          { label: "Trade CVaR 1%", value: formatNumber(risk.tradeCVaR1), help: RUN_DIAGNOSTIC_HELP.tradeCVaR1 },
        ]}
      />
      <div className="sine-run-distribution-grid">
        <Distribution title="Payoff distribution" help={RUN_DIAGNOSTIC_HELP.payoffDistribution} rows={risk.payoffHistogram} />
        <BreakdownTable title="Long vs short" help={RUN_DIAGNOSTIC_HELP.longShortBreakdown} rows={risk.byDirection} />
        <BreakdownTable title="Horizon" help={RUN_DIAGNOSTIC_HELP.horizonBreakdown} rows={risk.byHorizon} />
        <BreakdownTable title="Strength" help={RUN_DIAGNOSTIC_HELP.strengthBreakdown} rows={risk.byStrength} />
      </div>
    </DiagnosticsPanel>
  );
}
