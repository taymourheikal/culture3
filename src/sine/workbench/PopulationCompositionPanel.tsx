import type { RosterSpawnerSummary } from "../marketWorkerProtocol";
import { createVisiblePopulationComposition } from "../rosterView";
import { Metric } from "../SineMetric";

export function PopulationCompositionPanel({
  spawners,
  tick,
  totalSpawnerCount,
}: {
  spawners: RosterSpawnerSummary[];
  tick: number;
  totalSpawnerCount: number;
}) {
  const composition = createVisiblePopulationComposition(spawners, tick);
  const generationSummary = composition.generationBuckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => `${bucket.label}: ${bucket.count}`)
    .join(" / ");
  return (
    <section className="sine-workbench-panel">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Population Composition</span>
          <h2>Visible roster sample</h2>
        </div>
        <strong>
          {composition.totalVisible}/{totalSpawnerCount}
        </strong>
      </div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Long / short / wait" value={`${composition.actionCounts.long} / ${composition.actionCounts.short} / ${composition.actionCounts.wait}`} />
        <Metric label="Lineages visible" value={String(composition.lineageCount)} />
        <Metric label="Pending agents" value={String(composition.pendingFoodAgents)} />
        <Metric label="Newborn agents" value={String(composition.newbornAgents)} />
        <Metric label="Uniqueness sampled" value={`${composition.uniquenessSampled} / ${composition.uniquenessMissing} missing`} />
        <Metric label="Generations" value={generationSummary || "none"} />
      </div>
    </section>
  );
}
