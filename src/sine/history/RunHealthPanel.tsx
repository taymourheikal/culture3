import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel, formatNumber, formatPercent } from "./RunDiagnosticsUi";
import { SummaryMetricGrid } from "./RunDiagnosticsShared";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunHealthPanel({ diagnostics }: { diagnostics: SineSessionDiagnostics }) {
  const health = diagnostics.health;
  return (
    <DiagnosticsPanel title="Run Health" eyebrow="Population-level outcome" stat={`tick ${health.latestTick.toLocaleString()}`}>
      <SummaryMetricGrid
        metrics={[
          { label: "Final population", value: health.finalPopulation.toLocaleString() },
          { label: "Min population", value: health.minPopulation.toLocaleString() },
          { label: "Avg population", value: formatNumber(health.timeWeightedAveragePopulation) },
          { label: "Resolved trades", value: health.resolvedTrades.toLocaleString() },
          { label: "Hit rate", value: formatPercent(health.hitRate) },
          { label: "Avg payoff", value: formatNumber(health.averagePayoff) },
          { label: "Cumulative payoff", value: formatNumber(health.cumulativePayoff), help: RUN_DIAGNOSTIC_HELP.cumulativePayoff },
          { label: "Max drawdown", value: formatNumber(health.maxCumulativePayoffDrawdown), help: RUN_DIAGNOSTIC_HELP.payoffDrawdown },
          { label: "Worst tick payoff", value: formatNumber(health.worstSingleTickPayoff) },
        ]}
      />
    </DiagnosticsPanel>
  );
}
