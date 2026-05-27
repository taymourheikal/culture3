import type { ConnectionGene, SpawnerAgent } from "./spawnerSimulation";
import { connectionDetailRows } from "./architectureConnectionPresentation";
import { MetricRow } from "./ArchitectureShared";

export function ConnectionDetail({ connection, spawner }: { connection: ConnectionGene | null; spawner: SpawnerAgent | null }) {
  return (
    <section className="architecture-connection-detail">
      <div className="architecture-panel-title">Selected Connection</div>
      {connection ? (
        <div className="architecture-detail-grid">
          {connectionDetailRows(connection, spawner).map((row) => (
            <MetricRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      ) : (
        <p>Click any connection line or connection row to inspect its exact weight and metadata.</p>
      )}
    </section>
  );
}
