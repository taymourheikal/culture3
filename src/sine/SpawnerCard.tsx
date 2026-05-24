import { clamp } from "./charts/canvas";
import { formatSignedPercent } from "./charts/format";
import type { RosterSpawnerSummary } from "./marketWorkerProtocol";

export function SpawnerCard({
  spawner,
  tick,
  energyMax,
  healthMax,
  selected,
  onSelect,
}: {
  spawner: RosterSpawnerSummary;
  tick: number;
  energyMax: number;
  healthMax: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const isNewborn = tick - spawner.birthTick <= 7;
  return (
    <div className={`spawner-card${selected ? " selected" : ""}${isNewborn ? " newborn" : ""}`}>
      <button type="button" className="spawner-card-head" onClick={onSelect}>
        <span className="spawner-avatar">{spawner.id}</span>
        <span className="spawner-card-meta">
          <small>L{spawner.lineageId} / gen {spawner.generation}</small>
          <small>{spawner.cooldownTicks} tick cooldown</small>
        </span>
        <span className={`spawner-action ${spawner.lastAction}`}>{spawner.lastAction}</span>
      </button>
      <span className="spawner-bars">
        <SpawnerMeter label="Energy" value={spawner.energy} max={energyMax} color="#69d7d0" />
        <SpawnerMeter label="Health" value={spawner.health} max={healthMax} color="#86d87a" />
      </span>
      <span className="spawner-card-stats">
        <span>{spawner.pendingFoodCount} pending</span>
        <span>alive</span>
        <span>{Math.round(spawner.hitRate * 100)}% hit</span>
        <span>{formatSignedPercent(spawner.recentAveragePayoff)} recent</span>
      </span>
    </div>
  );
}

function SpawnerMeter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
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
