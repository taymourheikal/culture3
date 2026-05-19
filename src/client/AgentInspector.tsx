import { Activity, GitBranch, HeartPulse, ShieldAlert, Zap } from "lucide-react";
import type { Agent, Lineage } from "../sim/types";

type Props = {
  agent: Agent | null;
  lineage?: Lineage;
};

export function AgentInspector({ agent, lineage }: Props) {
  if (!agent) {
    return (
      <section className="panel inspector">
        <div className="panel-title">Selected Agent</div>
        <div className="empty-state">Click an agent in the world.</div>
      </section>
    );
  }

  return (
    <section className="panel inspector">
      <div className="panel-title">Agent #{agent.id}</div>
      <div className="agent-heading">
        <span className="lineage-dot" style={{ background: agent.color }} />
        <div>
          <strong>Lineage {agent.lineageId}</strong>
          <span>Generation {agent.generation}</span>
        </div>
      </div>
      <div className="metric-grid">
        <Metric icon={<Zap size={16} />} label="Energy" value={agent.energy.toFixed(0)} />
        <Metric icon={<HeartPulse size={16} />} label="Health" value={agent.health.toFixed(0)} />
        <Metric icon={<Activity size={16} />} label="Age" value={`${agent.age.toFixed(0)}s`} />
        <Metric icon={<ShieldAlert size={16} />} label="Kills" value={String(agent.kills)} />
        <Metric icon={<GitBranch size={16} />} label="Children" value={String(agent.children)} />
        <Metric icon={<GitBranch size={16} />} label="Parent" value={agent.parentId ? `#${agent.parentId}` : "Founder"} />
      </div>
      <div className="mutation-note">
        <span>Mutation</span>
        <strong>{agent.lastMutationSummary}</strong>
      </div>
      {lineage ? (
        <div className="lineage-note">
          Born {lineage.totalBorn} · Max gen {lineage.maxGeneration} · Food {lineage.totalFoodConsumed.toFixed(0)}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
