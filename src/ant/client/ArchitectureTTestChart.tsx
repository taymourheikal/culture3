import type { GroupStats, TTestResult } from "./batchAnalysis";

export type TTestMetric = {
  label: string;
  precision: number;
};

export function TTestChart({
  metric,
  leftLabel,
  rightLabel,
  leftStats,
  rightStats,
}: {
  metric: TTestMetric;
  leftLabel: string;
  rightLabel: string;
  leftStats: GroupStats;
  rightStats: GroupStats;
}) {
  const values = [
    leftStats.mean,
    leftStats.mean + leftStats.standardError,
    leftStats.mean - leftStats.standardError,
    rightStats.mean,
    rightStats.mean + rightStats.standardError,
    rightStats.mean - rightStats.standardError,
    0,
  ].filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, Math.abs(max || min) * 0.08, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const chartTop = 18;
  const chartBottom = 164;
  const y = (value: number) => chartBottom - ((value - domainMin) / Math.max(0.001, domainMax - domainMin)) * (chartBottom - chartTop);
  const zeroY = y(0);
  const bars = [
    { x: 175, label: "A", stats: leftStats, className: "ttest-bar-a" },
    { x: 465, label: "B", stats: rightStats, className: "ttest-bar-b" },
  ];

  return (
    <div className="ttest-chart-wrap">
      <svg className="ttest-chart" viewBox="0 0 640 214" role="img" aria-label={`${metric.label} architecture comparison`}>
        <line x1="46" x2="610" y1={zeroY} y2={zeroY} className="ttest-axis-line" />
        <text x="46" y={chartTop + 5} className="ttest-axis-text">
          {formatNumber(domainMax, metric.precision)}
        </text>
        <text x="46" y={chartBottom + 3} className="ttest-axis-text">
          {formatNumber(domainMin, metric.precision)}
        </text>
        {bars.map((bar) => {
          const meanY = y(bar.stats.mean);
          const top = Math.min(meanY, zeroY);
          const height = Math.max(2, Math.abs(zeroY - meanY));
          const errorTop = y(bar.stats.mean + bar.stats.standardError);
          const errorBottom = y(bar.stats.mean - bar.stats.standardError);
          return (
            <g key={bar.label}>
              <rect x={bar.x - 46} y={top} width="92" height={height} rx="7" className={`ttest-bar ${bar.className}`} />
              {bar.stats.n > 1 ? (
                <>
                  <line x1={bar.x} x2={bar.x} y1={errorTop} y2={errorBottom} className="ttest-error-line" />
                  <line x1={bar.x - 24} x2={bar.x + 24} y1={errorTop} y2={errorTop} className="ttest-error-line" />
                  <line x1={bar.x - 24} x2={bar.x + 24} y1={errorBottom} y2={errorBottom} className="ttest-error-line" />
                </>
              ) : null}
              <text x={bar.x} y="190" className="ttest-group-label">
                {bar.label}
              </text>
              <text x={bar.x} y="207" className="ttest-value-label">
                {formatNumber(bar.stats.mean, metric.precision)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="ttest-group-names">
        <div>
          <span>A</span>
          <strong>{leftLabel}</strong>
        </div>
        <div>
          <span>B</span>
          <strong>{rightLabel}</strong>
        </div>
      </div>
    </div>
  );
}

export function TTestReadout({
  metric,
  leftStats,
  rightStats,
  test,
}: {
  metric: TTestMetric;
  leftStats: GroupStats;
  rightStats: GroupStats;
  test: TTestResult | null;
}) {
  return (
    <div className="ttest-readout-grid">
      <ReadoutMetric label="A mean" value={formatNumber(leftStats.mean, metric.precision)} sublabel={`n ${leftStats.n} / SEM ${formatNumber(leftStats.standardError, metric.precision)}`} />
      <ReadoutMetric label="B mean" value={formatNumber(rightStats.mean, metric.precision)} sublabel={`n ${rightStats.n} / SEM ${formatNumber(rightStats.standardError, metric.precision)}`} />
      <ReadoutMetric label="p-value" value={test ? formatPValue(test.pValue) : "n/a"} sublabel={test ? "Welch two-tailed" : "Need more samples"} />
      <ReadoutMetric label="Mean diff" value={test ? formatNumber(test.meanDifference, metric.precision) : "n/a"} sublabel="A minus B" />
      <ReadoutMetric label="Effect size" value={test ? formatNumber(test.effectSize, 2) : "n/a"} sublabel="Cohen's d" />
      <ReadoutMetric label="t / df" value={test ? `${formatNumber(test.t, 2)} / ${formatNumber(test.degreesOfFreedom, 1)}` : "n/a"} sublabel="Welch statistic" />
    </div>
  );
}

function ReadoutMetric({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="convergence-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{sublabel}</em>
    </div>
  );
}

function formatNumber(value: number, precision: number) {
  if (!Number.isFinite(value)) {
    if (value === Number.POSITIVE_INFINITY) return "inf";
    if (value === Number.NEGATIVE_INFINITY) return "-inf";
    return "n/a";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision > 0 && Math.abs(value) < 10 ? Math.min(precision, 3) : 0,
  });
}

function formatPValue(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  if (value < 0.000001) return "<0.000001";
  if (value < 0.001) return value.toExponential(2);
  return value.toFixed(4);
}
