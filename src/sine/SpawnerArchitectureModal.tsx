import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { architectureMetrics, type SpawnerAgent } from "./spawnerSimulation";
import { ArchitectureGraph } from "./ArchitectureGraph";
import { UnitGateView } from "./UnitGateView";
import { ConnectionDetail } from "./ArchitectureConnectionDetail";
import { buildGraph } from "./spawnerArchitectureModel";

type Props = {
  spawner: SpawnerAgent;
  onClose: () => void;
};

export function SpawnerArchitectureModal({ spawner, onClose }: Props) {
  const [focusedUnitId, setFocusedUnitId] = useState<number | null>(null);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [minWeight, setMinWeight] = useState(0);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const graph = useMemo(() => buildGraph(spawner, includeDisabled, minWeight), [spawner, includeDisabled, minWeight]);
  const focusedUnit = focusedUnitId === null ? null : spawner.genome.units.find((unit) => unit.unitId === focusedUnitId) ?? null;
  const selectedConnection = spawner.genome.connections.find((connection) => connection.innovationId === selectedConnectionId) ?? null;
  const metrics = architectureMetrics(spawner.genome);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (focusedUnitId !== null && !spawner.genome.units.some((unit) => unit.unitId === focusedUnitId)) {
      setFocusedUnitId(null);
    }
    if (selectedConnectionId !== null && !spawner.genome.connections.some((connection) => connection.innovationId === selectedConnectionId)) {
      setSelectedConnectionId(null);
    }
  }, [focusedUnitId, selectedConnectionId, spawner]);

  return (
    <div className="architecture-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="architecture-modal" role="dialog" aria-modal="true" aria-label={`Spawner ${spawner.id} RNN architecture`}>
        <header className="architecture-modal-header">
          <button type="button" className="architecture-close-button" onClick={onClose} aria-label="Close architecture inspector">
            <X size={18} />
          </button>
          <div>
            <span className="sine-eyebrow">RNN Architecture Inspector</span>
            <h2>Spawner #{spawner.id}</h2>
          </div>
          <div className="architecture-header-stats">
            <span>L{spawner.lineageId}</span>
            <span>gen {spawner.generation}</span>
            <span>{metrics.activeUnits} units</span>
            <span>{metrics.activeConnections} active links</span>
          </div>
        </header>

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

        <ConnectionDetail connection={selectedConnection} />
      </section>
    </div>
  );
}
