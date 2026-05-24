import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentNeuralParameters, AgentsParameters } from "../sim/types";

type Props = {
  agents: AgentsParameters;
  onSave: (agents: AgentsParameters) => void;
};

export function AgentsPanel({ agents, onSave }: Props) {
  const [draft, setDraft] = useState<AgentsParameters>(() => structuredClone(agents));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(structuredClone(agents));
  }, [agents]);

  const updateFamily = (index: number, patch: Partial<AgentNeuralParameters>) => {
    const next = structuredClone(draft);
    const family = next.families[index];
    if (!family) return;
    next.families[index] = { ...family, ...patch };
    setDraft(next);
    setSaved(false);
  };

  const updateLineageCount = (value: number) => {
    const count = Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
    const next = structuredClone(draft);
    next.initialLineages = count;
    const fallback = next.families[0] ?? agents.families[0];
    if (!fallback) return;
    next.families = next.families.slice(0, count);
    while (next.families.length < count) {
      next.families.push(structuredClone(fallback));
    }
    setDraft(next);
    setSaved(false);
  };

  return (
    <div className="parameters-stack">
      <section className="panel parameter-group">
        <div className="parameter-group-head">
          <div>
            <div className="panel-title">Agent Families</div>
            <div className="fixed-contract">
              Inputs {draft.inputCount} · Outputs {draft.outputCount}
            </div>
          </div>
          <button
            type="button"
            className="save-group-button"
            title="Save agent defaults"
            onClick={() => {
              onSave(draft);
              setSaved(true);
            }}
          >
            <Save size={16} />
          </button>
        </div>
        <div className="fixed-contract">
          Input and output counts are fixed by the simulation contract.
        </div>
        <div className="parameter-fields lineage-count-fields">
          <NumberField label="Initial lineages" step={1} value={draft.initialLineages} onChange={updateLineageCount} />
        </div>
        {saved ? <div className="saved-defaults">Saved defaults</div> : null}
      </section>

      {draft.families.map((family, index) => (
        <section className="panel parameter-group" key={index}>
          <div className="panel-title">Lineage {index + 1}</div>
          <div className="parameter-fields">
            <label className="parameter-field">
              <span>Activation</span>
              <select
                value={family.activation}
                onChange={(event) => updateFamily(index, { activation: event.target.value as AgentNeuralParameters["activation"] })}
              >
                <option value="tanh">tanh</option>
                <option value="relu">relu</option>
                <option value="sigmoid">sigmoid</option>
              </select>
            </label>
            <NumberField
              label="Hidden neurons"
              step={1}
              value={family.hiddenCount}
              onChange={(value) => updateFamily(index, { hiddenCount: value })}
            />
            <label className="parameter-field">
              <span>2nd layer</span>
              <select
                value={family.secondLayerEnabled ? "yes" : "no"}
                onChange={(event) => updateFamily(index, { secondLayerEnabled: event.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <NumberField
              label="2nd layer neurons"
              step={1}
              value={family.secondHiddenCount}
              onChange={(value) => updateFamily(index, { secondHiddenCount: value })}
            />
            <NumberField
              label="Initial weight mean"
              step={0.01}
              value={family.initialWeightMean}
              onChange={(value) => updateFamily(index, { initialWeightMean: value })}
            />
            <NumberField
              label="Initial weight stddev"
              step={0.01}
              value={family.initialWeightStdDev}
              onChange={(value) => updateFamily(index, { initialWeightStdDev: value })}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function NumberField({
  label,
  step,
  value,
  onChange,
}: {
  label: string;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-field">
      <span>{label}</span>
      <input type="number" step={step} value={String(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
