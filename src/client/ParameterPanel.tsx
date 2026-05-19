import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { cloneParameters } from "../sim/parameters";
import type { SimulationParameters } from "../sim/types";
import { PARAMETER_GROUPS, type GroupKey } from "./parameterFields";

type Props = {
  parameters: SimulationParameters;
  onSaveGroup: <K extends GroupKey>(key: K, value: SimulationParameters[K]) => void;
};

export function ParameterPanel({ parameters, onSaveGroup }: Props) {
  const [draft, setDraft] = useState(() => cloneParameters(parameters));
  const [savedGroup, setSavedGroup] = useState<GroupKey | null>(null);

  useEffect(() => {
    setDraft(cloneParameters(parameters));
  }, [parameters]);

  return (
    <div className="parameters-stack">
      {PARAMETER_GROUPS.map((group) => (
        <section className="panel parameter-group" key={group.key}>
          <div className="parameter-group-head">
            <div className="panel-title">{group.title}</div>
            <button
              type="button"
              className="save-group-button"
              title={`Save ${group.title}`}
              onClick={() => {
                onSaveGroup(group.key, structuredClone(draft[group.key]) as never);
                setSavedGroup(group.key);
              }}
            >
              <Save size={16} />
            </button>
          </div>
          <div className="parameter-fields">
            {group.fields.flat().map((item) => (
              <label className="parameter-field" key={item.path}>
                <span>{item.label}</span>
                {item.options ? (
                  <select
                    value={String(getValue(draft, item.path))}
                    onChange={(event) => {
                      const next = cloneParameters(draft);
                      setValue(next, item.path, event.target.value);
                      setDraft(next);
                      if (savedGroup === group.key) setSavedGroup(null);
                    }}
                  >
                    {item.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    step={item.step ?? 0.01}
                    value={String(getValue(draft, item.path))}
                    onChange={(event) => {
                      const next = cloneParameters(draft);
                      setValue(next, item.path, Number(event.target.value));
                      setDraft(next);
                      if (savedGroup === group.key) setSavedGroup(null);
                    }}
                  />
                )}
              </label>
            ))}
          </div>
          {savedGroup === group.key ? <div className="saved-defaults">Saved defaults</div> : null}
        </section>
      ))}
    </div>
  );
}

function getValue(source: SimulationParameters, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return "";
    return (value as Record<string, unknown>)[key];
  }, source) as number;
}

function setValue(source: SimulationParameters, path: string, value: number | string) {
  const keys = path.split(".");
  let cursor: Record<string, unknown> = source as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = typeof value === "number" ? (Number.isFinite(value) ? value : 0) : value;
}
