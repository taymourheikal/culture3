import { useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { SineHelpTooltip } from "../SineHelpTooltip";

export type MiniSeriesPoint = {
  tick: number;
};

export type MiniSeriesDefinition<T> = {
  label: string;
  value: (row: T) => number;
  className?: string;
};

export type MiniChartBarDefinition<T> = {
  value: (row: T) => number;
  className?: (row: T) => string | undefined;
  maxValue?: number;
  maxHeight?: number;
};

type MiniChartGeometry = {
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  min: number;
  max: number;
  xMin: number;
  xMax: number;
  xValues: number[];
  centerSinglePoint: boolean;
  range: number;
};

type MultiSeriesReadoutValue = {
  label: string;
  value: number;
  className?: string;
};

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

export function MiniSeriesChart<T extends MiniSeriesPoint>({
  title,
  help,
  rows,
  value,
  suffix = "",
  strokeClassName,
  formatValue,
}: {
  title: string;
  help?: string;
  rows: T[];
  value: (row: T) => number;
  suffix?: string;
  strokeClassName?: string;
  formatValue?: (value: number, row: T) => string;
}) {
  return (
    <MiniCompositeChart
      title={title}
      help={help}
      rows={rows}
      series={[{ label: title, value, className: strokeClassName }]}
      formatReadout={(row) => {
        const activeValue = value(row);
        return formatValue ? formatValue(activeValue, row) : `${formatNumber(activeValue)}${suffix}`;
      }}
    />
  );
}

export function MultiSeriesChart<T extends MiniSeriesPoint>({
  title,
  help,
  rows,
  series,
  formatReadout,
}: {
  title: string;
  help?: string;
  rows: T[];
  series: Array<MiniSeriesDefinition<T>>;
  formatReadout?: (row: T, values: MultiSeriesReadoutValue[]) => string;
}) {
  return (
    <MiniCompositeChart
      title={title}
      help={help}
      rows={rows}
      series={series}
      className="sine-analysis-multi-chart"
      formatReadout={formatReadout}
      showLegend
    />
  );
}

export function MiniCompositeChart<T extends MiniSeriesPoint>({
  title,
  help,
  rows,
  series,
  bars,
  domainValues,
  width = 320,
  height = 110,
  plotTop = 10,
  plotBottom = height - 10,
  className,
  ariaLabel,
  xValue,
  centerSinglePoint = false,
  showHoverOnDefault = true,
  formatReadout,
  emptyReadout = formatNumber(0),
  showLegend = false,
}: {
  title: string;
  help?: string;
  rows: T[];
  series: Array<MiniSeriesDefinition<T>>;
  bars?: MiniChartBarDefinition<T>;
  domainValues?: (row: T) => number[];
  width?: number;
  height?: number;
  plotTop?: number;
  plotBottom?: number;
  className?: string;
  ariaLabel?: string;
  xValue?: (row: T, index: number) => number;
  centerSinglePoint?: boolean;
  showHoverOnDefault?: boolean;
  formatReadout?: (row: T, values: MultiSeriesReadoutValue[]) => string;
  emptyReadout?: string;
  showLegend?: boolean;
}) {
  const allValues = [
    ...series.flatMap((definition) => rows.map(definition.value)),
    ...(domainValues ? rows.flatMap(domainValues) : []),
  ];
  const geometry = miniChartGeometry(rows, allValues, { width, height, plotTop, plotBottom, xValue, centerSinglePoint });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activeIndex = activePointIndex(rows, hoverIndex);
  const activeRow = activeIndex === null ? null : rows[activeIndex] ?? null;
  const activeValues = activeRow ? series.map((definition) => ({ label: definition.label, value: definition.value(activeRow), className: definition.className })) : [];
  const activeTotal = activeValues.reduce((sum, item) => sum + item.value, 0);
  const readout = activeRow ? (formatReadout ? formatReadout(activeRow, activeValues) : formatNumber(activeTotal)) : emptyReadout;
  const updateHover = (event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>) => {
    setHoverIndex(nearestMiniChartIndex(rows, svgEventX(event, width), geometry));
  };
  return (
    <div className={["sine-analysis-mini-chart", className].filter(Boolean).join(" ")}>
      <div className="sine-analysis-mini-chart-head">
        <span className="sine-analysis-title-with-help">
          {title}
          {help ? <SineHelpTooltip help={help} /> : null}
        </span>
        <strong>{readout}</strong>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? `${title} over time`}
        onMouseMove={updateHover}
        onPointerMove={updateHover}
        onMouseLeave={() => setHoverIndex(null)}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <MiniChartGrid geometry={geometry} />
        {bars ? <MiniChartBars rows={rows} bars={bars} geometry={geometry} /> : null}
        {series.map((definition) => (
          <path
            key={definition.label}
            className={definition.className}
            d={miniSeriesPath(rows, definition.value, geometry)}
          />
        ))}
        {activeRow && (showHoverOnDefault || hoverIndex !== null) ? (
          <MiniChartHover
            geometry={geometry}
            row={activeRow}
            index={activeIndex ?? 0}
            values={series.map((definition) => ({ value: definition.value(activeRow), className: definition.className }))}
          />
        ) : null}
        <rect className="sine-analysis-hover-target" x={0} y={0} width={width} height={height} />
      </svg>
      {showLegend ? (
        <div className="sine-analysis-chart-legend">
          {series.map((definition) => (
            <span key={definition.label} className={definition.className}>
              {definition.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function miniChartGeometry<T extends MiniSeriesPoint>(
  rows: T[],
  values: number[],
  {
    width,
    height,
    plotTop = 10,
    plotBottom = height - 10,
    xValue,
    centerSinglePoint = false,
  }: {
    width: number;
    height: number;
    plotTop?: number;
    plotBottom?: number;
    xValue?: (row: T, index: number) => number;
    centerSinglePoint?: boolean;
  },
): MiniChartGeometry {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const xValues = rows.map((row, index) => xValue?.(row, index) ?? row.tick);
  const xMax = Math.max(1, ...xValues);
  return {
    width,
    height,
    plotTop,
    plotBottom,
    min,
    max,
    xMin: 0,
    xMax,
    xValues,
    centerSinglePoint,
    range: Math.max(1e-9, max - min),
  };
}

function miniSeriesPath<T extends MiniSeriesPoint>(
  rows: T[],
  value: (row: T) => number,
  geometry: MiniChartGeometry,
) {
  return rows
    .map((row, index) => {
      const x = miniChartX(index, geometry);
      const y = miniChartY(value(row), geometry);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function miniChartX(index: number, geometry: MiniChartGeometry) {
  if (geometry.centerSinglePoint && geometry.xValues.length <= 1) return geometry.width / 2;
  const xValue = geometry.xValues[index] ?? 0;
  return ((xValue - geometry.xMin) / Math.max(1e-9, geometry.xMax - geometry.xMin)) * geometry.width;
}

function miniChartY(value: number, geometry: MiniChartGeometry) {
  return geometry.plotBottom - ((value - geometry.min) / geometry.range) * (geometry.plotBottom - geometry.plotTop);
}

function activePointIndex<T>(rows: T[], hoverIndex: number | null) {
  if (rows.length === 0) return null;
  return hoverIndex ?? rows.length - 1;
}

function nearestMiniChartIndex<T extends MiniSeriesPoint>(rows: T[], x: number, geometry: MiniChartGeometry) {
  if (rows.length === 0) return null;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const distance = Math.abs(miniChartX(index, geometry) - x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function svgEventX(event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>, width: number) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
  return Math.max(0, Math.min(width, ratio * width));
}

function MiniChartGrid({ geometry }: { geometry: MiniChartGeometry }) {
  const verticalLines = [0.25, 0.5, 0.75];
  const horizontalLines = [0.25, 0.5, 0.75];
  return (
    <g className="sine-analysis-chart-gridlines" aria-hidden="true">
      {verticalLines.map((ratio) => {
        const x = ratio * geometry.width;
        return <line key={`v-${ratio}`} x1={x} x2={x} y1={0} y2={geometry.height} />;
      })}
      {horizontalLines.map((ratio) => {
        const y = ratio * geometry.height;
        return <line key={`h-${ratio}`} x1={0} x2={geometry.width} y1={y} y2={y} />;
      })}
    </g>
  );
}

function MiniChartBars<T extends MiniSeriesPoint>({
  rows,
  bars,
  geometry,
}: {
  rows: T[];
  bars: MiniChartBarDefinition<T>;
  geometry: MiniChartGeometry;
}) {
  const maxValue = bars.maxValue ?? Math.max(1, ...rows.map(bars.value));
  const maxHeight = bars.maxHeight ?? Math.min(42, geometry.plotBottom - geometry.plotTop);
  const barWidth = Math.max(2, geometry.width / Math.max(1, rows.length) - 1);
  return (
    <>
      {rows.map((row, index) => {
        const barHeight = (bars.value(row) / Math.max(1e-9, maxValue)) * maxHeight;
        return (
          <rect
            key={`bar-${row.tick}-${index}`}
            className={bars.className?.(row)}
            x={miniChartX(index, geometry) - barWidth / 2}
            y={geometry.plotBottom - barHeight}
            width={barWidth}
            height={barHeight}
          />
        );
      })}
    </>
  );
}

function MiniChartHover<T extends MiniSeriesPoint>({
  geometry,
  index,
  values,
}: {
  geometry: MiniChartGeometry;
  row: T;
  index: number;
  values: Array<{ value: number; className?: string }>;
}) {
  const x = miniChartX(index, geometry);
  return (
    <g className="sine-analysis-chart-hover" aria-hidden="true">
      <line className="sine-analysis-hover-line" x1={x} x2={x} y1={0} y2={geometry.height} />
      {values.map((item, index) => (
        <circle
          key={`${item.className ?? "series"}-${index}`}
          className={item.className}
          cx={x}
          cy={miniChartY(item.value, geometry)}
          r={3.5}
        />
      ))}
    </g>
  );
}

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

export function DiagnosticsPanel({ title, eyebrow, stat, children }: { title: string; eyebrow?: string; stat?: string; children: ReactNode }) {
  return (
    <section className="sine-workbench-panel">
      <div className="sine-workbench-panel-head">
        <div>
          {eyebrow ? <span className="sine-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {stat ? <strong>{stat}</strong> : null}
      </div>
      {children}
    </section>
  );
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 10) return value.toFixed(2);
  return value.toFixed(3);
}
