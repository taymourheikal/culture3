import { useEffect, useState } from "react";
import { clamp } from "../charts/canvas";
import { roundForInput } from "../charts/format";
import { SineHelpTooltip } from "../SineHelpTooltip";

export function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  help?: string;
  onChange: (value: number) => void;
}) {
  const formattedValue = String(roundForInput(value, step));
  const [draftValue, setDraftValue] = useState(formattedValue);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraftValue(formattedValue);
  }, [editing, formattedValue]);

  const commitFiniteValue = (text: string) => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return false;
    const nextValue = clamp(parsed, min, max);
    onChange(nextValue);
    return true;
  };

  return (
    <label className="sine-slider">
      <div>
        <span className="sine-slider-label">
          {label}
          {help ? <SineHelpTooltip help={help} /> : null}
        </span>
        <span className="sine-slider-value">
          <strong>{display}</strong>
          <input
            type="number"
            value={draftValue}
            min={min}
            max={max}
            step={step}
            onFocus={() => setEditing(true)}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraftValue(nextDraft);
              if (isPartialNumberText(nextDraft)) return;
              commitFiniteValue(nextDraft);
            }}
            onBlur={() => {
              setEditing(false);
              if (isPartialNumberText(draftValue) || !commitFiniteValue(draftValue)) {
                setDraftValue(formattedValue);
                return;
              }
              setDraftValue(String(roundForInput(clamp(Number(draftValue), min, max), step)));
            }}
          />
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(nextValue);
          setDraftValue(String(roundForInput(nextValue, step)));
        }}
      />
    </label>
  );
}

function isPartialNumberText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === "." || trimmed === "-." || trimmed === "+." || /[.]$/.test(trimmed);
}
