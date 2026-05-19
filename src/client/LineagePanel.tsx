import { Skull, Users } from "lucide-react";
import type { Lineage } from "../sim/types";

type Props = {
  lineages: Lineage[];
};

export function LineagePanel({ lineages }: Props) {
  const active = lineages
    .filter((lineage) => lineage.currentPopulation > 0)
    .sort((a, b) => b.currentPopulation - a.currentPopulation)
    .slice(0, 8);
  const extinct = lineages.filter((lineage) => lineage.currentPopulation === 0).length;

  return (
    <section className="panel lineage-panel">
      <div className="panel-title">Top Lineages</div>
      <div className="lineage-list">
        {active.map((lineage) => (
          <div className="lineage-row" key={lineage.id}>
            <span className="lineage-dot" style={{ background: lineage.color }} />
            <strong>{lineage.id}</strong>
            <span className="lineage-pop">
              <Users size={14} />
              {lineage.currentPopulation}
            </span>
            <span>Gen {lineage.maxGeneration}</span>
          </div>
        ))}
      </div>
      <div className="extinction-row">
        <Skull size={15} />
        {extinct} extinct lineages
      </div>
    </section>
  );
}
