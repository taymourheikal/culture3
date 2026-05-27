import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { architectureMetrics, learnedStateNorm, plasticitySummary, type SpawnerAgent } from "./spawnerSimulation";
import { ArchitectureGraph } from "./ArchitectureGraph";
import { UnitGateView } from "./UnitGateView";
import { ConnectionDetail } from "./ArchitectureConnectionDetail";
import { buildGraph } from "./spawnerArchitectureModel";
import type { SpawnerUniquenessScore } from "./spawnerSimulation";

type Props = {
  spawnerId: number;
  spawner: SpawnerAgent | null;
  loading: boolean;
  modeLabel?: string;
  uniqueness?: SpawnerUniquenessScore | null;
  onClose: () => void;
};

export function SpawnerArchitectureModal({ spawnerId, spawner, loading, modeLabel = "RNN Architecture Inspector", uniqueness, onClose }: Props) {
  const [focusedUnitId, setFocusedUnitId] = useState<number | null>(null);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [minWeight, setMinWeight] = useState(0);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const graph = useMemo(() => (spawner ? buildGraph(spawner, includeDisabled, minWeight) : null), [spawner, includeDisabled, minWeight]);
  const focusedUnit = focusedUnitId === null || !spawner ? null : spawner.genome.units.find((unit) => unit.unitId === focusedUnitId) ?? null;
  const selectedConnection = spawner?.genome.connections.find((connection) => connection.innovationId === selectedConnectionId) ?? null;
  const metrics = spawner ? architectureMetrics(spawner.genome) : null;
  const learnedDeltaNorm = spawner ? learnedStateNorm(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta) : 0;
  const plasticity = spawner ? plasticitySummary(spawner.genome.plasticityProfile) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!spawner) return;
    if (focusedUnitId !== null && !spawner.genome.units.some((unit) => unit.unitId === focusedUnitId)) {
      setFocusedUnitId(null);
    }
    if (selectedConnectionId !== null && !spawner.genome.connections.some((connection) => connection.innovationId === selectedConnectionId)) {
      setSelectedConnectionId(null);
    }
  }, [focusedUnitId, selectedConnectionId, spawner]);

  return (
    <div className="architecture-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="architecture-modal" role="dialog" aria-modal="true" aria-label={`Spawner ${spawnerId} RNN architecture`}>
        <header className="architecture-modal-header">
          <button type="button" className="architecture-close-button" onClick={onClose} aria-label="Close architecture inspector">
            <X size={18} />
          </button>
          <div>
            <span className="sine-eyebrow">{modeLabel}</span>
            <h2>Spawner #{spawnerId}</h2>
          </div>
          {spawner && metrics ? (
            <div className="architecture-header-stats">
              <span>L{spawner.lineageId}</span>
              <span>gen {spawner.generation}</span>
              <span>{metrics.activeUnits} units</span>
              <span>{metrics.activeConnections} active links</span>
              <span>learned {learnedDeltaNorm.toFixed(3)}</span>
              {plasticity ? <span>lr {plasticity.learningRateMean.toFixed(3)}</span> : null}
              {uniqueness ? <span>unique pct {Math.round(uniqueness.score * 100)}%</span> : null}
            </div>
          ) : null}
        </header>

        {loading || !spawner || !graph ? (
          <div className="architecture-empty-state">{loading ? "Loading RNN architecture..." : "This spawner is no longer alive."}</div>
        ) : (
          <>
            <div className="architecture-toolbar">
              <label>
                <input type="checkbox" checked={includeDisabled} onChange={(event) => setIncludeDisabled(event.target.checked)} />
                Include disabled genes
              </label>
              <label>
                Min abs weight
                <input type="number" min={0} step={0.05} value={minWeight} onChange={(event) => setMinWeight(Math.max(0, Number(event.target.value) || 0))} />
              </label>
            </div>

            {focusedUnit ? (
              <UnitGateView
                unit={focusedUnit}
                spawner={spawner}
                includeDisabled={includeDisabled}
                minWeight={minWeight}
                selectedConnectionId={selectedConnectionId}
                onBack={() => setFocusedUnitId(null)}
                onSelectConnection={setSelectedConnectionId}
              />
            ) : (
              <ArchitectureGraph
                graph={graph}
                spawner={spawner}
                selectedConnectionId={selectedConnectionId}
                onFocusUnit={setFocusedUnitId}
                onSelectConnection={setSelectedConnectionId}
              />
            )}

            <ConnectionDetail connection={selectedConnection} spawner={spawner} />
          </>
        )}
      </section>
    </div>
  );
}
