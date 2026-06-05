import type { SineSessionDiagnostics } from "./sineHistoryTypes";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { EventTimeline } from "./DistributionViews";
import { MiniSeriesChart, MultiSeriesChart } from "./MiniCharts";
import { formatNumber } from "./diagnosticFormatters";
import { SummaryMetricGrid } from "./RunDiagnosticsShared";
import { SineHelpTooltip } from "../SineHelpTooltip";
import { RUN_DIAGNOSTIC_HELP } from "../sineMetricHelp";

export function RunResiliencePanel({ diagnostics }: { diagnostics: SineSessionDiagnostics }) {
  const resilience = diagnostics.resilience;
  const deathCauseRows = resilience.deathCauseSeries.map((row) => ({ ...row, tick: row.bucketStartTick }));
  const classifiedDeathCauses = deathCauseRows.reduce((sum, row) => sum + row.lowEnergyDeaths + row.lowHealthDeaths + row.bothDeaths, 0);
  const thresholdMetrics = resilience.thresholdTicks.map((row) => ({
    label: `Ticks below ${row.threshold}`,
    value: row.ticks.toLocaleString(),
  }));
  return (
    <DiagnosticsPanel title="Resilience" eyebrow="Population survival" stat={`min ${resilience.minPopulation.toLocaleString()}`}>
      <div className="sine-analysis-chart-grid">
        {classifiedDeathCauses > 0 ? (
          <MultiSeriesChart
            title="Death Causes"
            help={RUN_DIAGNOSTIC_HELP.deathCauses}
            rows={deathCauseRows}
            formatReadout={(_, values) => `E ${formatSeriesCount(values, "Low energy")} / H ${formatSeriesCount(values, "Low health")} / B ${formatSeriesCount(values, "Both")}`}
            series={[
              { label: "Low energy", value: (row) => row.lowEnergyDeaths, className: "low-energy" },
              { label: "Low health", value: (row) => row.lowHealthDeaths, className: "low-health" },
              { label: "Both", value: (row) => row.bothDeaths, className: "both" },
            ]}
          />
        ) : (
          <DeathCauseUnavailable unknownDeathCauses={resilience.unknownDeathCauses} />
        )}
        <MiniSeriesChart title="Population drawdown" help={RUN_DIAGNOSTIC_HELP.populationDrawdown} rows={resilience.populationSeries.map(toPopulationDrawdownSeries)} value={(row) => row.value} />
      </div>
      <SummaryMetricGrid
        metrics={[
          { label: "Worst pop drawdown", value: formatNumber(resilience.worstPopulationDrawdown) },
          { label: "Worst tick drop", value: formatNumber(resilience.worstSingleTickPopulationDrop) },
          { label: "Avg pop drawdown", value: formatNumber(resilience.averagePopulationDrawdown) },
          ...(resilience.unknownDeathCauses > 0 ? [{ label: "Unknown death causes", value: resilience.unknownDeathCauses.toLocaleString() }] : []),
          ...thresholdMetrics,
        ]}
      />
      <EventTimeline rows={resilience.churnBuckets} />
    </DiagnosticsPanel>
  );
}

function formatSeriesCount(values: Array<{ label: string; value: number }>, label: string) {
  return Math.round(values.find((value) => value.label === label)?.value ?? 0).toLocaleString();
}

function DeathCauseUnavailable({ unknownDeathCauses }: { unknownDeathCauses: number }) {
  return (
    <div className="sine-analysis-mini-chart sine-analysis-empty-chart">
      <div>
        <span className="sine-analysis-title-with-help">
          Death Causes
          <SineHelpTooltip help={RUN_DIAGNOSTIC_HELP.deathCauses} />
        </span>
        <strong>{unknownDeathCauses.toLocaleString()}</strong>
      </div>
      <div className="sine-analysis-chart-empty">
        Death-cause classification starts with newly saved deaths.
      </div>
    </div>
  );
}

function toPopulationDrawdownSeries(row: { tick: number; population: number }, index: number, rows: Array<{ tick: number; population: number }>) {
  const peak = Math.max(...rows.slice(0, index + 1).map((point) => point.population));
  return { tick: row.tick, value: row.population - peak };
}
