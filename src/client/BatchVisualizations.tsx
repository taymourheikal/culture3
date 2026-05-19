import { useMemo, useState } from "react";
import type { BatchRunSummary } from "../sim/batch";
import {
  architectureDistribution,
  exactCountDistribution,
  filterLineages,
  flattenLineages,
  histogram,
  integerHistogram,
  TRAITS,
  type TraitKey,
} from "./batchAnalysis";
import { ChartCard, FrequencyBars, HistogramBars, ScopeButton, type LineageScope } from "./charts";

type Props = {
  runs: BatchRunSummary[];
};

export function BatchVisualizations({ runs }: Props) {
  const [scope, setScope] = useState<LineageScope>("all");
  const lineages = useMemo(() => filterLineages(flattenLineages(runs), scope), [runs, scope]);
  const architectureItems = useMemo(() => architectureDistribution(lineages), [lineages]);
  const survivorBins = useMemo(
    () => exactCountDistribution(runs.map((run) => run.survivingLineageCount)),
    [runs],
  );
  const finalPopulationBins = useMemo(
    () => integerHistogram(runs.map((run) => run.population), 8),
    [runs],
  );
  const lineagePopulationBins = useMemo(
    () => integerHistogram(lineages.map((lineage) => lineage.population), 8),
    [lineages],
  );

  return (
    <section className="panel visualization-panel">
      <div className="visualization-head">
        <div>
          <div className="panel-title">Distributions</div>
          <div className="fixed-contract">{lineages.length} surviving lineage samples</div>
        </div>
        <div className="scope-tabs">
          <ScopeButton label="All" value="all" scope={scope} onChange={setScope} />
          <ScopeButton label="Founders" value="founders" scope={scope} onChange={setScope} />
          <ScopeButton label="Rescue" value="rescue" scope={scope} onChange={setScope} />
        </div>
      </div>

      <div className="visualization-grid">
        <ChartCard title="Surviving NN Architectures" empty={architectureItems.length === 0}>
          <FrequencyBars items={architectureItems} />
        </ChartCard>
        <ChartCard title="Surviving Lineages Per Run" empty={survivorBins.length === 0}>
          <HistogramBars bins={survivorBins} />
        </ChartCard>
        <ChartCard title="Final Population Per Run" empty={finalPopulationBins.length === 0}>
          <HistogramBars bins={finalPopulationBins} />
        </ChartCard>
        <ChartCard title="Surviving Lineage Population" empty={lineagePopulationBins.length === 0}>
          <HistogramBars bins={lineagePopulationBins} />
        </ChartCard>
      </div>

      <div className="trait-distribution-grid">
        {TRAITS.map((trait) => (
          <ChartCard title={trait.label} empty={lineages.length === 0} key={trait.key}>
            <HistogramBars bins={histogram(lineages.map((lineage) => lineage.averageTraits[trait.key as TraitKey]), 7, trait.precision)} compact />
          </ChartCard>
        ))}
      </div>
    </section>
  );
}
