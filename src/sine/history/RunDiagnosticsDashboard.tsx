import type { SineSessionAnalysis } from "./sineHistoryTypes";
import { RunHealthPanel } from "./RunHealthPanel";
import { RunPopulationStructurePanel } from "./RunPopulationStructurePanel";
import { RunResiliencePanel } from "./RunResiliencePanel";
import { RunRiskTailPanel } from "./RunRiskTailPanel";
import { RunTradeQualityPanel } from "./RunTradeQualityPanel";
import { RunTradingPerformancePanel } from "./RunTradingPerformancePanel";

export function RunDiagnosticsDashboard({ analysis }: { analysis: SineSessionAnalysis }) {
  const diagnostics = analysis.diagnostics;
  return (
    <div className="sine-headless-analysis sine-run-diagnostics">
      <RunHealthPanel diagnostics={diagnostics} />
      <RunResiliencePanel diagnostics={diagnostics} />
      <RunTradingPerformancePanel diagnostics={diagnostics} />
      <RunTradeQualityPanel analysis={analysis} diagnostics={diagnostics} />
      <RunRiskTailPanel diagnostics={diagnostics} />
      <RunPopulationStructurePanel diagnostics={diagnostics} />
    </div>
  );
}
