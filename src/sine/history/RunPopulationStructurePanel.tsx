import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel, EventTimeline, formatNumber, formatPercent } from "./RunDiagnosticsUi";
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
          { label: "Top payoff lineage", value: structure.topLineagePayoffLineageId === null ? "--" : `L${structure.topLineagePayoffLineageId}` },
          { label: "Top payoff share", value: formatPercent(structure.topLineagePayoffShare) },
          { label: "Births / 1k ticks", value: formatNumber(structure.birthsPer1000Ticks) },
          { label: "Deaths / 1k ticks", value: formatNumber(structure.deathsPer1000Ticks) },
          { label: "Median age", value: formatNumber(structure.ageSummary.median), help: RUN_DIAGNOSTIC_HELP.agentAge },
          { label: "P95 age", value: formatNumber(structure.ageSummary.p95), help: RUN_DIAGNOSTIC_HELP.agentAge },
          { label: "Max age", value: formatNumber(structure.ageSummary.max), help: RUN_DIAGNOSTIC_HELP.agentAge },
        ]}
      />
      <EventTimeline rows={structure.birthDeathTimeline} />
      <div className="sine-run-distribution-grid">
        <Distribution title="Agent age" help={RUN_DIAGNOSTIC_HELP.agentAge} rows={structure.ageHistogram} />
      </div>
    </DiagnosticsPanel>
  );
}
