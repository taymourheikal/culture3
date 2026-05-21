import { useMemo, useState } from "react";
import { clamp } from "./charts/canvas";
import { formatSignedPercent } from "./charts/format";
import {
  architectureMetrics,
  computeSpawnerUniqueness,
  spawnerAveragePayoff,
  spawnerHitRate,
  type SpawnerAgent,
  type SpawnerFood,
  type SpawnerUniquenessScore,
  type SpawnerWorld,
} from "./spawnerSimulation";
import { Metric } from "./SineMetric";

export function SpawnerRoster({
  spawners,
  foods,
  world,
  pendingFoods,
  totalWins,
  totalLosses,
  selectedSpawner,
  selectedSpawnerId,
  onSelect,
  onInspect,
}: {
  spawners: SpawnerAgent[];
  foods: SpawnerFood[];
  world: SpawnerWorld;
  pendingFoods: number;
  totalWins: number;
  totalLosses: number;
  selectedSpawner: SpawnerAgent | null;
  selectedSpawnerId: number | null;
  onSelect: (id: number | null) => void;
  onInspect: (id: number) => void;
}) {
  const [uniquenessModalOpen, setUniquenessModalOpen] = useState(false);
  const visibleFoods = foods.length;
  const selectedMetrics = selectedSpawner ? architectureMetrics(selectedSpawner.genome) : null;
  const uniquenessScores = useMemo(() => computeSpawnerUniqueness(spawners, world.config), [spawners, world.config, world.tick]);
  const selectedUniqueness = selectedSpawner ? uniquenessScores.get(selectedSpawner.id) ?? null : null;
  const recentDeathEvents = world.recentEvents.filter((event) => event.kind === "death").slice(-4);

  return (
    <section className="spawner-panel">
      <div className="spawner-panel-header">
        <div>
          <span className="sine-eyebrow">Food Spawner RNNs</span>
          <h2>Opportunity scouts</h2>
        </div>
        <div className="spawner-summary">
          <span>{spawners.length} active</span>
          <span>{pendingFoods} pending</span>
          <span>{totalWins} wins</span>
          <span>{totalLosses} losses</span>
          <span>{visibleFoods} visible</span>
        </div>
      </div>

      <div className={`spawner-event-strip${recentDeathEvents.length === 0 ? " empty" : ""}`} aria-label="Recent spawner deaths">
        {recentDeathEvents.length > 0 ? (
          recentDeathEvents.map((event) => <span key={event.id}>death #{event.spawnerId}</span>)
        ) : (
          <span aria-hidden="true">No recent deaths</span>
        )}
      </div>

      <div className="spawner-roster" aria-label="Food spawner agents">
        {spawners.map((spawner) => (
          <SpawnerCard
            key={spawner.id}
            spawner={spawner}
            world={world}
            selected={selectedSpawnerId === spawner.id}
            onSelect={() => onSelect(selectedSpawnerId === spawner.id ? null : spawner.id)}
          />
        ))}
      </div>

      {selectedSpawner ? (
        <div className="spawner-detail">
          <Metric label="Selected" value={`#${selectedSpawner.id} / L${selectedSpawner.lineageId}`} />
          <Metric label="Spawned" value={String(selectedSpawner.spawnedCount)} />
          <Metric label="Resolved" value={String(selectedSpawner.resolvedCount)} />
          <Metric label="Children" value={String(selectedSpawner.children)} />
          <Metric label="Hit rate" value={`${Math.round(spawnerHitRate(selectedSpawner) * 100)}%`} />
          <Metric label="Avg payoff" value={formatSignedPercent(spawnerAveragePayoff(selectedSpawner))} />
          {selectedMetrics ? (
            <>
              <Metric label="Active units" value={String(selectedMetrics.activeUnits)} />
              <Metric label="Active layers" value={String(selectedMetrics.activeLayers)} />
              <Metric label="Active links" value={String(selectedMetrics.activeConnections)} />
              <Metric label="Disabled genes" value={`${selectedMetrics.disabledUnits}u / ${selectedMetrics.disabledConnections}l`} />
              <Metric label="Recurrent links" value={String(selectedMetrics.recurrentConnections)} />
              <Metric label="Skip links" value={String(selectedMetrics.skipConnections)} />
              <Metric label="Mutation std" value={selectedSpawner.genome.mutationStd.toFixed(3)} />
              {selectedUniqueness ? (
                <button type="button" className="uniqueness-open-card" onClick={() => setUniquenessModalOpen(true)}>
                  <span>Uniqueness</span>
                  <strong>{formatScore(selectedUniqueness.overall)}</strong>
                </button>
              ) : null}
              <button type="button" className="architecture-open-card" onClick={() => onInspect(selectedSpawner.id)}>
                Inspect RNN
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {selectedSpawner && selectedUniqueness && uniquenessModalOpen ? (
        <UniquenessModal spawner={selectedSpawner} score={selectedUniqueness} onClose={() => setUniquenessModalOpen(false)} />
      ) : null}
    </section>
  );
}

function SpawnerCard({ spawner, world, selected, onSelect }: { spawner: SpawnerAgent; world: SpawnerWorld; selected: boolean; onSelect: () => void }) {
  const spawnerPendingFoods = world.foods.filter((food) => food.creatorSpawnerId === spawner.id && food.status === "pending").length;
  const recentAverage = spawner.recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, spawner.recentPayoffs.length);
  const isNewborn = world.tick - spawner.birthTick <= Math.round(1.2 / world.config.tickSeconds);
  return (
    <div className={`spawner-card${selected ? " selected" : ""}${isNewborn ? " newborn" : ""}`}>
      <button type="button" className="spawner-card-head" onClick={onSelect}>
        <span className="spawner-avatar">{spawner.id}</span>
        <span className="spawner-card-meta">
          <small>L{spawner.lineageId} / gen {spawner.generation}</small>
          <small>{spawner.cooldown.toFixed(1)}s cooldown</small>
        </span>
        <span className={`spawner-action ${spawner.lastAction}`}>{spawner.lastAction}</span>
      </button>
      <span className="spawner-bars">
        <Meter label="Energy" value={spawner.energy} max={world.config.reproductionEnergy} color="#69d7d0" />
        <Meter label="Health" value={spawner.health} max={world.config.initialHealth} color="#86d87a" />
      </span>
      <span className="spawner-card-stats">
        <span>{spawnerPendingFoods} pending</span>
        <span>alive</span>
        <span>{Math.round(spawnerHitRate(spawner) * 100)}% hit</span>
        <span>{formatSignedPercent(recentAverage)} recent</span>
      </span>
    </div>
  );
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percent = clamp(value / Math.max(1, max), 0, 1) * 100;
  return (
    <span className="spawner-meter">
      <span>
        {label}
        <strong>{value.toFixed(label === "Health" ? 0 : 1)}</strong>
      </span>
      <span className="spawner-meter-track">
        <span style={{ width: `${percent}%`, background: color }} />
      </span>
    </span>
  );
}

function UniquenessModal({ spawner, score, onClose }: { spawner: SpawnerAgent; score: SpawnerUniquenessScore; onClose: () => void }) {
  return (
    <div className="uniqueness-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="uniqueness-modal" role="dialog" aria-modal="true" aria-label={`Spawner ${spawner.id} uniqueness`} onClick={(event) => event.stopPropagation()}>
        <div className="uniqueness-modal-head">
          <div>
            <span className="sine-eyebrow">Spawner #{spawner.id}</span>
            <h3>Uniqueness</h3>
          </div>
          <button type="button" className="uniqueness-close" onClick={onClose} aria-label="Close uniqueness modal">
            x
          </button>
        </div>
        <div className="uniqueness-score-grid">
          <UniquenessMetric label="Overall" value={score.overall} />
          <UniquenessMetric label="Genome" value={score.genome} />
          <UniquenessMetric label="Behavior" value={score.behavior} />
          <UniquenessMetric label="Complexity" value={score.complexity} />
        </div>
        <div className="uniqueness-neighbors">
          <span>Nearest neighbors</span>
          <strong>{score.nearestNeighborIds.length > 0 ? score.nearestNeighborIds.map((id) => `#${id}`).join(", ") : "none"}</strong>
        </div>
      </section>
    </div>
  );
}

function UniquenessMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="uniqueness-metric">
      <span>{label}</span>
      <strong>{formatScore(value)}</strong>
    </div>
  );
}

function formatScore(value: number) {
  return clamp(value, 0, 1).toFixed(2);
}
