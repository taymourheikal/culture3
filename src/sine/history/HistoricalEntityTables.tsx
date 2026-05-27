import type { SineSessionAnalysis } from "./sineHistoryTypes";
import { HistorySection, SpawnerHistoryButton } from "./HistoryUi";

export function HistoricalEntityTables({ analysis, onInspect }: { analysis: SineSessionAnalysis; onInspect: (spawnerId: number) => void }) {
  return (
    <div className="sine-history-tables">
      <HistorySection title="Top Spawners">
        {analysis.topSpawners.slice(0, 6).map((spawner) => (
          <SpawnerHistoryButton key={spawner.spawnerId} spawnerId={spawner.spawnerId} onInspect={onInspect}>
            #{spawner.spawnerId} · L{spawner.lineageId} · avg {spawner.averagePayoff.toFixed(3)} · learned{" "}
            {spawner.learnedDeltaNorm.toFixed(3)}
          </SpawnerHistoryButton>
        ))}
      </HistorySection>
      <HistorySection title="Lineages">
        {analysis.lineages.slice(0, 6).map((lineage) => (
          <div key={lineage.lineageId}>
            L{lineage.lineageId} · alive {lineage.livingPopulation} · born {lineage.births} · max gen {lineage.maxGeneration}
          </div>
        ))}
      </HistorySection>
      <HistorySection title="Most Unique">
        {analysis.uniqueness.mostUnique.slice(0, 6).map((score) => (
          <SpawnerHistoryButton key={score.spawnerId} spawnerId={score.spawnerId} onInspect={onInspect}>
            #{score.spawnerId} · score {score.score.toFixed(3)}
          </SpawnerHistoryButton>
        ))}
      </HistorySection>
      <HistorySection title="Most Typical">
        {analysis.uniqueness.mostTypical.slice(0, 6).map((score) => (
          <SpawnerHistoryButton key={score.spawnerId} spawnerId={score.spawnerId} onInspect={onInspect}>
            #{score.spawnerId} · score {score.score.toFixed(3)}
          </SpawnerHistoryButton>
        ))}
      </HistorySection>
    </div>
  );
}
