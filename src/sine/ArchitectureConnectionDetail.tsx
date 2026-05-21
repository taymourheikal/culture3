import type { ConnectionGene } from "./spawnerSimulation";
import { sourceLabel, targetLabel } from "./spawnerArchitectureModel";
import { MetricRow } from "./ArchitectureShared";

export function ConnectionDetail({ connection }: { connection: ConnectionGene | null }) {
  return (
    <section className="architecture-connection-detail">
      <div className="architecture-panel-title">Selected Connection</div>
      {connection ? (
        <div className="architecture-detail-grid">
          <MetricRow label="Innovation" value={String(connection.innovationId)} />
          <MetricRow label="Source" value={sourceLabel(connection.source)} />
          <MetricRow label="Target" value={targetLabel(connection.target)} />
          <MetricRow label="Weight" value={connection.weight.toFixed(5)} />
          <MetricRow label="State" value={connection.enabled ? "enabled" : "disabled"} />
        </div>
      ) : (
        <p>Click any connection line or connection row to inspect its exact weight and metadata.</p>
      )}
    </section>
  );
}
