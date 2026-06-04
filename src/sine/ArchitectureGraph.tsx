import {
  INPUT_COUNT,
  OUTPUT_COUNT,
  OUTPUT_LABELS,
  mutationProfileDetailGroups,
  perceptionDetailRows,
  summarizeMutationProfile,
  getEffectiveOutputBiasDetail,
  tradingPolicyDetailRows,
  type SpawnerAgent,
} from "./spawnerSimulation";
import {
  type ArchitectureGraphModel,
  type GraphConnection,
  type GraphNode,
} from "./spawnerArchitectureModel";
import { MetricRow } from "./ArchitectureShared";
import { graphConnectionStyle } from "./architectureConnectionPresentation";

export function ArchitectureGraph({
  graph,
  spawner,
  selectedConnectionId,
  onFocusUnit,
  onSelectConnection,
}: {
  graph: ArchitectureGraphModel;
  spawner: SpawnerAgent;
  selectedConnectionId: number | null;
  onFocusUnit: (unitId: number) => void;
  onSelectConnection: (innovationId: number) => void;
}) {
  const mutation = summarizeMutationProfile(spawner.genome.mutationProfile);
  const tradingPolicyRows = tradingPolicyDetailRows(spawner.genome.tradingPolicy);
  const perceptionRows = perceptionDetailRows(spawner.genome.perception);
  const mutationGroups = mutationProfileDetailGroups(spawner.genome.mutationProfile);

  return (
    <div className="architecture-body-grid">
      <div className="architecture-graph-scroll">
        <svg className="architecture-graph" viewBox={`0 0 ${graph.width} ${graph.height}`} style={{ minWidth: graph.width, minHeight: graph.height }}>
          <defs>
            <marker id="architecture-arrow-positive" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--sine-accent)" />
            </marker>
            <marker id="architecture-arrow-negative" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--sine-negative)" />
            </marker>
            <marker id="architecture-arrow-disabled" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--sine-text-faint)" />
            </marker>
          </defs>
          {graph.connections.map((edge) => (
            <ArchitectureConnection
              key={edge.connection.innovationId}
              edge={edge}
              selected={selectedConnectionId === edge.connection.innovationId}
              onSelect={onSelectConnection}
            />
          ))}
          {graph.nodes.map((node) => (
            <g key={node.id} className={`architecture-node ${node.kind}${node.unit && !node.unit.enabled ? " disabled" : ""}`}>
              <ArchitectureNode node={node} onFocusUnit={onFocusUnit} />
            </g>
          ))}
        </svg>
      </div>

      <aside className="architecture-side-panel">
        <div className="architecture-panel-title">Genome</div>
        <MetricRow label="Inputs" value={String(INPUT_COUNT)} />
        <MetricRow label="Outputs" value={String(OUTPUT_COUNT)} />
        <MetricRow label="Total units" value={String(spawner.genome.units.length)} />
        <MetricRow label="Total connections" value={String(spawner.genome.connections.length)} />
        <MetricRow label="Topology mutation" value={mutation.topologyRate.toFixed(3)} />
        <MetricRow label="Weight mutation" value={mutation.weightActivity.toFixed(3)} />
        <MetricRow label="Profile drift" value={mutation.mutationProfileMutationStdDev.toFixed(3)} />
        <MetricRow label="Threshold bias" value={spawner.genome.thresholdBias.toFixed(3)} />
        <MetricRow label="Horizon" value={`${Math.round(spawner.genome.minHorizonTicks)}-${Math.round(spawner.genome.maxHorizonTicks)} ticks`} />
        <MetricRow label="Cooldown base" value={`${Math.round(spawner.genome.cooldownBaseTicks)} ticks`} />
        <div className="architecture-panel-title">Trading Policy</div>
        {tradingPolicyRows.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
        <div className="architecture-panel-title">Perception</div>
        {perceptionRows.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
        {mutationGroups.map((group) => (
          <div key={group.title}>
            <div className="architecture-panel-title">{group.title}</div>
            {group.rows.map((row) => (
              <MetricRow key={`${group.title}:${row.label}`} label={row.label} value={row.value} />
            ))}
          </div>
        ))}
        <div className="architecture-panel-title">Output Biases</div>
        {OUTPUT_LABELS.map((label, index) => {
          const detail = getEffectiveOutputBiasDetail(spawner.genome, index, spawner.learnedState);
          return (
            <MetricRow
              key={label}
              label={label}
              value={`${detail.effective.toFixed(3)} (base ${detail.base.toFixed(3)}, learned ${detail.learnedDelta.toFixed(3)})`}
            />
          );
        })}
      </aside>
    </div>
  );
}

function ArchitectureConnection({
  edge,
  selected,
  onSelect,
}: {
  edge: GraphConnection;
  selected: boolean;
  onSelect: (innovationId: number) => void;
}) {
  const style = graphConnectionStyle(edge.connection);
  const midX = (edge.from.x + edge.to.x) / 2;
  const d = `M ${edge.from.x + 44} ${edge.from.y} C ${midX} ${edge.from.y}, ${midX} ${edge.to.y}, ${edge.to.x - 44} ${edge.to.y}`;

  return (
    <g className={`architecture-edge${selected ? " selected" : ""}`} onClick={() => onSelect(edge.connection.innovationId)}>
      <path d={d} fill="none" stroke={style.color} strokeWidth={style.width} strokeOpacity={style.opacity} strokeDasharray={style.dash} markerEnd={style.marker}>
        <title>{style.summary}</title>
      </path>
      <text x={midX} y={(edge.from.y + edge.to.y) / 2 - 4} fill={style.color}>
        {style.label}
      </text>
    </g>
  );
}

function ArchitectureNode({ node, onFocusUnit }: { node: GraphNode; onFocusUnit: (unitId: number) => void }) {
  const content = (
    <>
      <rect x={node.x - 42} y={node.y - 20} width={84} height={40} rx={8} />
      <text x={node.x} y={node.y - 2} textAnchor="middle">
        {node.label}
      </text>
      <text x={node.x} y={node.y + 12} textAnchor="middle" className="architecture-node-sub">
        {node.sublabel}
      </text>
    </>
  );

  if (node.kind !== "unit" || !node.unit) return content;
  const unit = node.unit;
  return (
    <g className="architecture-unit-click-target" onClick={() => onFocusUnit(unit.unitId)}>
      {content}
    </g>
  );
}
