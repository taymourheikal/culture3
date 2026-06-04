import { SineHelpTooltip } from "./SineHelpTooltip";

export function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="sine-metric">
      <span className="sine-metric-label">
        {label}
        {help ? <SineHelpTooltip help={help} /> : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
