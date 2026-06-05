import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { EventTimeline } from "./DistributionViews";
import { formatNumber, formatPercent } from "./diagnosticFormatters";
import { Distribution, SummaryMetricGrid } from "./RunDiagnosticsShared";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunPopulationStructurePanel({ diagnostics }: { diagnostics: SineSessionDiagnostics }) {
  const structure = diagnostics.populationStructure;
  return (
    <DiagnosticsPanel title="Evolution / Population Structure" eyebrow="Lineage concentration" stat={`${structure.liveLineageCount.toLocaleString()} live lineages`}>
      <SummaryMetricGrid
        metrics={[
          { label: "Max generation", value: structure.maxGenerationEver.toLocaleString() },
          { label: "Top lineage", value: structure.topLineageId === null ? "--" : `L${structure.topLineageId}` },
          { label: "Top lineage pop share", value: formatPercent(structure.topLineagePopulationShare) },
          { label: "Top-3 pop share", value: formatPercent(structure.top3LineagePopulationShare) },
          { label: "Top winning lineage", value: structure.topLineagePayoffLineageId === null ? "--" : `L${structure.topLineagePayoffLineageId}` },
          { label: "Top winning contribution", value: formatPercent(structure.topLineagePayoffShare), help: RUN_DIAGNOSTIC_HELP.topLineagePayoffShare },
          { label: "Births / 1k ticks", value: formatNumber(structure.birthsPer1000Ticks) },
          { label: "Deaths / 1k ticks", value: formatNumber(structure.deathsPer1000Ticks) },
          { label: "Median age exposure", value: formatNumber(structure.ageSummary.median), help: RUN_DIAGNOSTIC_HELP.agentAge },
          { label: "P95 age exposure", value: formatNumber(structure.ageSummary.p95), help: RUN_DIAGNOSTIC_HELP.agentAge },
          { label: "Max age exposure", value: formatNumber(structure.ageSummary.max), help: RUN_DIAGNOSTIC_HELP.agentAge },
        ]}
      />
      <EventTimeline rows={structure.birthDeathTimeline} />
      <div className="sine-run-distribution-grid">
        <Distribution title="Agent age exposure" help={RUN_DIAGNOSTIC_HELP.agentAge} rows={structure.ageHistogram} />
      </div>
    </DiagnosticsPanel>
  );
}
