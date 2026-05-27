import { useState } from "react";
import { formatSignedPercent } from "./charts/format";
import type { RosterSpawnerSummary, SpawnerUniquenessDetailPacket } from "./marketWorkerProtocol";
import { Metric } from "./SineMetric";
import { SpawnerCard } from "./SpawnerCard";
import { SpawnerUniquenessModal } from "./SpawnerUniquenessModal";

export function SpawnerRoster({
  spawners,
  totalSpawnerCount,
  tick,
  pendingFoods,
  totalWins,
  totalLosses,
  visibleFoods,
  energyMax,
  healthMax,
  recentDeathEvents,
  selectedSpawner,
  selectedSpawnerId,
  uniquenessDetail,
  uniquenessLoadingId,
  onSelect,
  onInspect,
  onInspectById,
  onRequestUniqueness,
}: {
  spawners: RosterSpawnerSummary[];
  totalSpawnerCount: number;
  tick: number;
  pendingFoods: number;
  totalWins: number;
  totalLosses: number;
  visibleFoods: number;
  energyMax: number;
  healthMax: number;
  recentDeathEvents: Array<{ id: number; spawnerId: number }>;
  selectedSpawner: RosterSpawnerSummary | null;
  selectedSpawnerId: number | null;
  uniquenessDetail: SpawnerUniquenessDetailPacket | null;
  uniquenessLoadingId: number | null;
  onSelect: (id: number | null) => void;
  onInspect: (id: number) => void;
  onInspectById: (id: number) => void;
  onRequestUniqueness: (id: number) => void;
}) {
  const [uniquenessModalOpen, setUniquenessModalOpen] = useState(false);
  const [inspectId, setInspectId] = useState("");
  const uniquenessModalSpawnerId = selectedSpawner?.id ?? selectedSpawnerId;

  const openUniqueness = (spawnerId: number) => {
    setUniquenessModalOpen(true);
    onRequestUniqueness(spawnerId);
  };

  return (
    <section className="spawner-panel">
      <div className="spawner-panel-header">
        <div>
          <span className="sine-eyebrow">Food Spawner RNNs</span>
          <h2>Opportunity scouts</h2>
        </div>
        <div className="spawner-summary">
          <span>{totalSpawnerCount} active</span>
          {spawners.length < totalSpawnerCount ? <span>{spawners.length} shown</span> : null}
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

      <form
        className="spawner-inspect-by-id"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Math.floor(Number(inspectId));
          if (Number.isFinite(parsed) && parsed > 0) onInspectById(parsed);
        }}
      >
        <label>
          Inspect spawner ID
          <input
            type="number"
            min={1}
            step={1}
            value={inspectId}
            placeholder="471"
            onChange={(event) => setInspectId(event.target.value)}
          />
        </label>
        <button type="submit">Inspect RNN</button>
      </form>

      <div className="spawner-roster" aria-label="Food spawner agents">
        {spawners.map((spawner) => (
          <SpawnerCard
            key={spawner.id}
            spawner={spawner}
            tick={tick}
            energyMax={energyMax}
            healthMax={healthMax}
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
          <Metric label="Hit rate" value={`${Math.round(selectedSpawner.hitRate * 100)}%`} />
          <Metric label="Avg payoff" value={formatSignedPercent(selectedSpawner.averagePayoff)} />
          <Metric label="Active units" value={String(selectedSpawner.activeUnits)} />
          <Metric label="Active layers" value={String(selectedSpawner.activeLayers)} />
          <Metric label="Active links" value={String(selectedSpawner.activeConnections)} />
          <Metric label="Disabled genes" value={`${selectedSpawner.disabledUnits}u / ${selectedSpawner.disabledConnections}l`} />
          <Metric label="Recurrent links" value={String(selectedSpawner.recurrentConnections)} />
          <Metric label="Skip links" value={String(selectedSpawner.skipConnections)} />
          <Metric label="Avg perception lag" value={`${selectedSpawner.averagePerceptionLag.toFixed(1)} ticks`} />
          <Metric label="Longest window" value={`${Math.round(selectedSpawner.longestPerceptionWindow)} ticks`} />
          <Metric label="Pending scale" value={`${Math.round(selectedSpawner.pendingDensityScale)} ticks`} />
          <Metric label="Perception mutation" value={selectedSpawner.perceptionMutationRate.toFixed(3)} />
          <Metric label="Topology mutation" value={selectedSpawner.topologyMutationRate.toFixed(3)} />
          <Metric label="Weight mutation" value={selectedSpawner.weightMutationActivity.toFixed(3)} />
          <Metric label="Profile drift" value={selectedSpawner.mutationProfileDrift.toFixed(3)} />
          <Metric label="Learned delta norm" value={selectedSpawner.learnedDeltaNorm.toFixed(3)} />
          <Metric label="Recent learning" value={selectedSpawner.recentLearningSignal.toFixed(3)} />
          <Metric label="Learning updates" value={String(selectedSpawner.learningUpdateCount)} />
          <Metric label="Repro learning" value={String(selectedSpawner.reproductionLearningCount)} />
          <Metric label="Learning rate" value={selectedSpawner.plasticityLearningRateMean.toFixed(3)} />
          <Metric label="Learning decay" value={selectedSpawner.plasticityDecayRate.toFixed(3)} />
          <Metric label="Max learned delta" value={selectedSpawner.plasticityMaxLearnedDelta.toFixed(2)} />
          <Metric label="Plasticity drift" value={selectedSpawner.plasticityMutationStdDev.toFixed(3)} />
          <button type="button" className="uniqueness-open-card" onClick={() => openUniqueness(selectedSpawner.id)}>
            <span>{uniquenessLoadingId === selectedSpawner.id ? "Loading uniqueness" : "Uniqueness percentile"}</span>
            <strong>{selectedSpawner.uniqueness !== null ? formatScore(selectedSpawner.uniqueness) : "detail"}</strong>
            {selectedSpawner.uniquenessComparisonTick !== null ? <small>tick {selectedSpawner.uniquenessComparisonTick}</small> : null}
          </button>
          <button type="button" className="architecture-open-card" onClick={() => onInspect(selectedSpawner.id)}>
            Inspect RNN
          </button>
        </div>
      ) : selectedSpawnerId !== null ? (
        <div className="spawner-detail">
          <Metric label="Selected" value={`#${selectedSpawnerId}`} />
          <Metric label="Roster" value="outside visible list" />
          <button type="button" className="uniqueness-open-card" onClick={() => openUniqueness(selectedSpawnerId)}>
            <span>{uniquenessLoadingId === selectedSpawnerId ? "Loading uniqueness" : "Uniqueness percentile"}</span>
            <strong>detail</strong>
          </button>
          <button type="button" className="architecture-open-card" onClick={() => onInspect(selectedSpawnerId)}>
            Inspect RNN
          </button>
        </div>
      ) : null}

      {uniquenessModalSpawnerId !== null && uniquenessModalOpen ? (
        <SpawnerUniquenessModal
          spawnerId={uniquenessModalSpawnerId}
          detail={uniquenessDetail?.spawnerId === uniquenessModalSpawnerId ? uniquenessDetail : null}
          loading={uniquenessLoadingId === uniquenessModalSpawnerId}
          onClose={() => setUniquenessModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

function formatScore(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
