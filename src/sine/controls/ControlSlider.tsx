import { CircleHelp } from "lucide-react";
import { clamp } from "../charts/canvas";
import { roundForInput } from "../charts/format";

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
  return (
    <label className="sine-slider">
      <div>
        <span className="sine-slider-label">
          {label}
          {help ? (
            <span className="sine-help" tabIndex={0} aria-label={help}>
              <CircleHelp size={13} aria-hidden="true" />
              <span className="sine-help-tooltip" role="tooltip">
                {help}
              </span>
            </span>
          ) : null}
        </span>
        <span className="sine-slider-value">
          <strong>{display}</strong>
          <input
            type="number"
            value={roundForInput(value, step)}
            min={min}
            max={max}
            step={step}
            onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          />
        </span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
