import type { CSSProperties, ReactNode } from "react";
import { SineHelpTooltip } from "../SineHelpTooltip";

type Tone = "accent" | "positive" | "amber" | "negative" | "purple";

export function AgentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="selected-spawner-section">
      <div className="selected-spawner-section-title">{title}</div>
      {children}
    </section>
  );
}

export function AgentBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "amber" | "long" | "short" | "wait" }) {
  return <span className={`selected-spawner-badge ${tone}`}>{label}</span>;
}

export function AgentMeter({
  label,
  value,
  max,
  valueLabel,
  tone = "accent",
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  tone?: Tone;
}) {
  return (
    <div className={`selected-spawner-meter ${tone}`}>
      <span>
        <b>{label}</b>
        <b>{valueLabel}</b>
      </span>
      <i style={{ "--meter-value": `${clampedPercent(value / Math.max(1e-9, max))}%` } as CSSProperties} />
    </div>
  );
}

export function AgentScore({
  label,
  value,
  amount,
  tone = "accent",
  help,
}: {
  label: string;
  value: string;
  amount: number;
  tone?: Tone;
  help?: string;
}) {
  return (
    <div className={`selected-spawner-score ${tone}`}>
      <span className="selected-spawner-score-label">
        {label}
        {help ? <SineHelpTooltip help={help} /> : null}
      </span>
      <strong>{value}</strong>
      <i style={{ "--meter-value": `${clampedPercent(amount)}%` } as CSSProperties} />
    </div>
  );
}

export function MetricBar({
  label,
  value,
  amount,
  tone = "accent",
  help,
}: {
  label: string;
  value: string;
  amount: number;
  tone?: Tone;
  help?: string;
}) {
  return (
    <div className={`selected-spawner-metric-bar ${tone}`}>
      <span>
        <b className="selected-spawner-metric-label">
          {label}
          {help ? <SineHelpTooltip help={help} /> : null}
        </b>
        <b>{value}</b>
      </span>
      <i style={{ "--meter-value": `${clampedPercent(amount)}%` } as CSSProperties} />
    </div>
  );
}

export function WorkbenchMeter({ label, value, amount }: { label: string; value: string; amount: number }) {
  return (
    <div className="sine-workbench-meter">
      <span>
        <b>{label}</b>
        <b>{value}</b>
      </span>
      <i style={{ "--meter-value": `${Math.max(0, Math.min(100, amount))}%` } as CSSProperties} />
    </div>
  );
}

export function clampedPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value * 100 : 0));
}

export function signedAmount(value: number) {
  return Math.min(1, Math.abs(value) / 5);
}

export function payoffTone(value: number): "positive" | "negative" | "amber" {
  if (value > 0.005) return "positive";
  if (value < -0.005) return "negative";
  return "amber";
}
