import { useMemo, useState } from "react";
import { formatSignedPercent } from "./charts/format";
import type { RosterSpawnerSummary, SpawnerUniquenessDetailPacket } from "./marketWorkerProtocol";
import {
  DEFAULT_ROSTER_FILTERS,
  viewRosterSpawners,
  type RosterActionFilter,
  type RosterSortDirection,
  type RosterSortKey,
} from "./rosterView";
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
  onOpenUniqueness,
  showSelectedDetail = true,
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
  onOpenUniqueness?: (id: number) => void;
  showSelectedDetail?: boolean;
}) {
  const [uniquenessModalOpen, setUniquenessModalOpen] = useState(false);
  const [inspectId, setInspectId] = useState("");
  const [sortKey, setSortKey] = useState<RosterSortKey>("id");
  const [sortDirection, setSortDirection] = useState<RosterSortDirection>("asc");
  const [filters, setFilters] = useState(DEFAULT_ROSTER_FILTERS);
  const uniquenessModalSpawnerId = selectedSpawner?.id ?? selectedSpawnerId;
  const visibleSpawners = useMemo(
    () =>
      viewRosterSpawners(spawners, {
        sortKey,
        sortDirection,
        filters,
        tick,
      }),
    [filters, sortDirection, sortKey, spawners, tick],
  );

  const openUniqueness = (spawnerId: number) => {
    if (onOpenUniqueness) {
      onOpenUniqueness(spawnerId);
      return;
    }
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
          {visibleSpawners.length !== spawners.length ? <span>{visibleSpawners.length} filtered</span> : null}
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

      <div className="spawner-roster-tools" aria-label="Visible roster sorting and filtering">
        <label>
          Search
          <input
            type="search"
            value={filters.search}
            placeholder="ID or lineage"
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <label>
          Sort
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as RosterSortKey)}>
            <option value="id">ID</option>
            <option value="generation">Generation</option>
            <option value="energy">Energy</option>
            <option value="health">Health</option>
            <option value="pendingFoodCount">Pending food</option>
            <option value="hitRate">Hit rate</option>
            <option value="averagePayoff">Avg payoff</option>
            <option value="recentAveragePayoff">Recent payoff</option>
            <option value="children">Children</option>
            <option value="activeConnections">Active links</option>
            <option value="uniqueness">Uniqueness</option>
          </select>
        </label>
        <label>
          Direction
          <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as RosterSortDirection)}>
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>
        <label>
          Action
          <select value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value as RosterActionFilter }))}>
            <option value="all">All</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="wait">Wait</option>
          </select>
        </label>
        <label>
          Min resolved
          <input
            type="number"
            min={0}
            step={1}
            value={filters.minResolvedTrades}
            placeholder="20"
            onChange={(event) => setFilters((current) => ({ ...current, minResolvedTrades: event.target.value }))}
          />
        </label>
        <label>
          Min age ticks
          <input
            type="number"
            min={0}
            step={1}
            value={filters.minAgeTicks}
            placeholder="1000"
            onChange={(event) => setFilters((current) => ({ ...current, minAgeTicks: event.target.value }))}
          />
        </label>
      </div>

      <div className="spawner-roster" aria-label="Food spawner agents">
        {visibleSpawners.map((spawner) => (
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
        {visibleSpawners.length === 0 ? <div className="spawner-roster-empty">No visible roster agents match these filters.</div> : null}
      </div>

      {showSelectedDetail && selectedSpawner ? (
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
      ) : showSelectedDetail && selectedSpawnerId !== null ? (
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

      {!onOpenUniqueness && uniquenessModalSpawnerId !== null && uniquenessModalOpen ? (
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
