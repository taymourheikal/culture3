import { ArrowLeft } from "lucide-react";
import { getEffectiveGateBiasDetail, type ConnectionGene, type HiddenUnitGene, type SpawnerAgent } from "./spawnerSimulation";
import { filteredConnections, sourceLabel, targetLabel } from "./spawnerArchitectureModel";
import { connectionIsActive, createGenomeIndex } from "./spawner/genome";
import { connectionRowClass, connectionRowParts } from "./architectureConnectionPresentation";

export function UnitGateView({
  unit,
  spawner,
  includeDisabled,
  minWeight,
  selectedConnectionId,
  onBack,
  onSelectConnection,
}: {
  unit: HiddenUnitGene;
  spawner: SpawnerAgent;
  includeDisabled: boolean;
  minWeight: number;
  selectedConnectionId: number | null;
  onBack: () => void;
  onSelectConnection: (innovationId: number) => void;
}) {
  const genomeIndex = createGenomeIndex(spawner.genome);
  const connections = filteredConnections(spawner.genome.connections, includeDisabled, minWeight).filter(
    (connection) => includeDisabled || connectionIsActive(connection, genomeIndex.activeUnitIds),
  );
  const incoming = connections.filter((connection) => connection.target.kind === "hidden" && connection.target.unitId === unit.unitId);
  const outgoing = connections.filter((connection) => connection.source.kind === "hidden" && connection.source.unitId === unit.unitId);
  const incomingByGate = {
    update: incoming.filter((connection) => connection.target.kind === "hidden" && connection.target.gate === "update"),
    reset: incoming.filter((connection) => connection.target.kind === "hidden" && connection.target.gate === "reset"),
    candidate: incoming.filter((connection) => connection.target.kind === "hidden" && connection.target.gate === "candidate"),
  };

  return (
    <div className="gate-view">
      <div className="gate-view-head">
        <button type="button" className="architecture-back-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Full graph
        </button>
        <div>
          <div className="architecture-panel-title">Unit #{unit.unitId}</div>
          <p>
            Layer {unit.layerIndex} · innovation {unit.innovationId} · hidden state {(spawner.hiddenState[unit.unitId] ?? 0).toFixed(3)}
          </p>
        </div>
      </div>

      <div className="gate-diagram">
        <div className="gate-source-column">
          {uniqueSources(incoming).map((source) => (
            <div className="gate-source-node" key={source}>
              {source}
            </div>
          ))}
        </div>
        <div className="gate-internal-column">
          <GateNode title="Update gate" detail={getEffectiveGateBiasDetail(spawner.genome, unit, "update", spawner.learnedState)} count={incomingByGate.update.length} />
          <GateNode title="Reset gate" detail={getEffectiveGateBiasDetail(spawner.genome, unit, "reset", spawner.learnedState)} count={incomingByGate.reset.length} />
          <GateNode title="Candidate gate" detail={getEffectiveGateBiasDetail(spawner.genome, unit, "candidate", spawner.learnedState)} count={incomingByGate.candidate.length} />
          <StateNode title="Hidden state" value={spawner.hiddenState[unit.unitId] ?? 0} count={outgoing.length} />
        </div>
        <div className="gate-source-column">
          {uniqueTargets(outgoing).map((target) => (
            <div className="gate-target-node" key={target}>
              {target}
            </div>
          ))}
        </div>
      </div>

      <div className="gate-connection-grid">
        <ConnectionGroup title="Incoming to update" connections={incomingByGate.update} selectedId={selectedConnectionId} onSelect={onSelectConnection} />
        <ConnectionGroup title="Incoming to reset" connections={incomingByGate.reset} selectedId={selectedConnectionId} onSelect={onSelectConnection} />
        <ConnectionGroup title="Incoming to candidate" connections={incomingByGate.candidate} selectedId={selectedConnectionId} onSelect={onSelectConnection} />
        <ConnectionGroup title="Outgoing from unit" connections={outgoing} selectedId={selectedConnectionId} onSelect={onSelectConnection} />
      </div>
    </div>
  );
}

function ConnectionGroup({
  title,
  connections,
  selectedId,
  onSelect,
}: {
  title: string;
  connections: ConnectionGene[];
  selectedId: number | null;
  onSelect: (innovationId: number) => void;
}) {
  return (
    <section className="gate-connection-group">
      <div className="architecture-panel-title">{title}</div>
      {connections.length === 0 ? (
        <p>No visible connections.</p>
      ) : (
        connections.map((connection) => {
          const row = connectionRowParts(connection);
          return (
            <button
              type="button"
              className={connectionRowClass(connection, selectedId === connection.innovationId)}
              key={connection.innovationId}
              onClick={() => onSelect(connection.innovationId)}
            >
              <span>{row.source}</span>
              <strong>{row.weight}</strong>
              <span>{row.target}</span>
            </button>
          );
        })
      )}
    </section>
  );
}

function GateNode({
  title,
  detail,
  count,
}: {
  title: string;
  detail: { base: number; learnedDelta: number; effective: number };
  count: number;
}) {
  return (
    <div className="gate-node">
      <span>{title}</span>
      <strong>{detail.effective.toFixed(3)}</strong>
      <small>
        base {detail.base.toFixed(3)} · learned {detail.learnedDelta.toFixed(3)}
      </small>
      <small>{count} visible links</small>
    </div>
  );
}

function StateNode({ title, value, count }: { title: string; value: number; count: number }) {
  return (
    <div className="gate-node">
      <span>{title}</span>
      <strong>{value.toFixed(3)}</strong>
      <small>{count} visible links</small>
    </div>
  );
}

function uniqueSources(connections: ConnectionGene[]) {
  return [...new Set(connections.map((connection) => sourceLabel(connection.source)))];
}

function uniqueTargets(connections: ConnectionGene[]) {
  return [...new Set(connections.map((connection) => targetLabel(connection.target)))];
}
