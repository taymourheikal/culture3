import { useState, type MouseEvent, type PointerEvent } from "react";
import { SineHelpTooltip } from "../SineHelpTooltip";
import { formatNumber } from "./diagnosticFormatters";
import { finiteMiniChartValue, miniChartBarHeight, miniChartBarMax, miniChartGeometry, miniChartX, miniChartY, type MiniChartGeometry } from "./miniChartGeometry";

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

type MultiSeriesReadoutValue = {
  label: string;
  value: number;
  className?: string;
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
  const activeValues = activeRow
    ? series.map((definition) => ({ label: definition.label, value: finiteMiniChartValue(definition.value(activeRow), 0), className: definition.className }))
    : [];
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
            values={activeValues}
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
  const maxValue = bars.maxValue ?? miniChartBarMax(rows.map(bars.value));
  const maxHeight = bars.maxHeight ?? Math.min(42, geometry.plotBottom - geometry.plotTop);
  const barWidth = Math.max(2, geometry.width / Math.max(1, rows.length) - 1);
  return (
    <>
      {rows.map((row, index) => {
        const barHeight = miniChartBarHeight(bars.value(row), maxValue, maxHeight);
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
