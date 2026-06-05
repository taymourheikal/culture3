import { SineHelpTooltip } from "../SineHelpTooltip";
import { formatNumber, formatPercent } from "./diagnosticFormatters";

export type BreakdownRow = {
  bucket?: string;
  direction?: string;
  trades: number;
  hitRate?: number | null;
  averagePayoff: number;
};

export type EventTimelineRow = {
  bucketStartTick: number;
  births: number;
  deaths: number;
  reproductions?: number;
  events: number;
  includesFounderBirths?: boolean;
};

export function EventTimeline({ rows }: { rows: EventTimelineRow[] }) {
  const maxEvents = Math.max(1, ...rows.map((row) => row.events));
  return (
    <div className="sine-analysis-event-timeline">
      {rows.map((row) => (
        <div key={row.bucketStartTick} className="sine-analysis-event-row">
          <span>{row.bucketStartTick.toLocaleString()}</span>
          <div>
            <i className="births" style={{ width: `${(row.births / maxEvents) * 100}%` }} />
            <i className="deaths" style={{ width: `${(row.deaths / maxEvents) * 100}%` }} />
            {row.reproductions !== undefined ? <i className="reproductions" style={{ width: `${(row.reproductions / maxEvents) * 100}%` }} /> : null}
          </div>
          <strong>
            +{row.births} / -{row.deaths}
            {row.reproductions !== undefined ? ` / r${row.reproductions}` : ""}
            {row.includesFounderBirths ? " incl founders" : ""}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function BreakdownTable({ title, help, rows, compact = false }: { title: string; help?: string; rows: BreakdownRow[]; compact?: boolean }) {
  return (
    <div className="sine-analysis-breakdown-table">
      <div className="sine-analysis-section-title sine-analysis-title-with-help">
        {title}
        {help ? <SineHelpTooltip help={help} /> : null}
      </div>
      {rows.map((row) => (
        <div key={row.bucket ?? row.direction} className="sine-analysis-breakdown-row">
          <span>{row.bucket ?? row.direction}</span>
          <strong>{row.trades.toLocaleString()}</strong>
          {!compact ? <span>{formatPercent(row.hitRate ?? 0)}</span> : null}
          <span>{formatNumber(row.averagePayoff)}</span>
        </div>
      ))}
    </div>
  );
}

export function HistogramBars({ rows, valueLabel = "count" }: { rows: Array<{ label: string; count: number }>; valueLabel?: string }) {
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="sine-run-histogram" role="table" aria-label={valueLabel}>
      {rows.map((row) => (
        <div key={row.label} className="sine-run-histogram-row" role="row">
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${(row.count / maxCount) * 100}%` }} />
          </div>
          <strong>{row.count.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}
