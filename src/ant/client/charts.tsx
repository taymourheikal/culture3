import type { ReactNode } from "react";

export type LineageScope = "all" | "founders" | "rescue";

export type FrequencyItem = {
  label: string;
  count: number;
};

export type HistogramBin = {
  label: string;
  title?: string;
  count: number;
};

export function ScopeButton({
  label,
  value,
  scope,
  onChange,
}: {
  label: string;
  value: LineageScope;
  scope: LineageScope;
  onChange: (scope: LineageScope) => void;
}) {
  return (
    <button type="button" className={scope === value ? "scope-tab active" : "scope-tab"} onClick={() => onChange(value)}>
      {label}
    </button>
  );
}

export function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      {empty ? <div className="chart-empty">No samples</div> : children}
    </div>
  );
}

export function FrequencyBars({ items }: { items: FrequencyItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="frequency-list">
      {items.map((item) => (
        <div className="frequency-row" key={item.label}>
          <div className="frequency-label" title={item.label}>
            {item.label}
          </div>
          <div className="frequency-track">
            <div className="frequency-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <div className="frequency-count">{item.count}</div>
        </div>
      ))}
    </div>
  );
}

export function HistogramBars({ bins, compact = false }: { bins: HistogramBin[]; compact?: boolean }) {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <div className={compact ? "histogram compact" : "histogram"}>
      <div className="histogram-bars">
        {bins.map((bin, index) => (
          <div className="histogram-column" key={`${bin.label}-${index}`}>
            <div className="histogram-value">{bin.count}</div>
            <div className="histogram-bar" style={{ height: `${Math.max(3, (bin.count / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="histogram-labels">
        {bins.map((bin, index) => (
          <span key={`${bin.label}-${index}`} title={bin.title ?? bin.label}>
            {bin.label}
          </span>
        ))}
      </div>
    </div>
  );
}
