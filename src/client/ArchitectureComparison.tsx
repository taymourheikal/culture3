import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { BatchRunSummary, SurvivingLineageSummary } from "../sim/batch";
import { architectureKey, architectureLabel, groupStats, welchTTest, type GroupStats, type TTestResult } from "./batchAnalysis";

type Props = {
  runs: BatchRunSummary[];
};

type ComparisonSample = {
  key: string;
  architectureKey: string;
  architectureLabel: string;
  lineage: SurvivingLineageSummary;
};

type MetricDefinition = {
  key: string;
  label: string;
  precision: number;
  getValue: (sample: ComparisonSample) => number;
};

const METRICS: MetricDefinition[] = [
  { key: "population", label: "StopTick lineage population", precision: 0, getValue: (sample) => sample.lineage.population },
  { key: "maxPopulation", label: "Max lineage population", precision: 0, getValue: (sample) => sample.lineage.maxPopulation },
  { key: "maxGeneration", label: "Max generation", precision: 0, getValue: (sample) => sample.lineage.maxGeneration },
  { key: "totalBorn", label: "Born", precision: 0, getValue: (sample) => sample.lineage.totalBorn },
  { key: "totalKilled", label: "Kills", precision: 0, getValue: (sample) => sample.lineage.totalKilled },
  { key: "foodPerAgent", label: "Avg food consumed", precision: 2, getValue: (sample) => sample.lineage.totalFoodConsumed / Math.max(1, sample.lineage.population) },
  { key: "speed", label: "Speed", precision: 2, getValue: (sample) => sample.lineage.averageTraits.speed },
  { key: "attackPower", label: "Attack power", precision: 1, getValue: (sample) => sample.lineage.averageTraits.attackPower },
  { key: "attackRange", label: "Attack range", precision: 1, getValue: (sample) => sample.lineage.averageTraits.attackRange },
  { key: "metabolism", label: "Metabolism", precision: 3, getValue: (sample) => sample.lineage.averageTraits.metabolism },
  { key: "foodSensitivity", label: "Food focus", precision: 2, getValue: (sample) => sample.lineage.averageTraits.foodSensitivity },
  { key: "aggressionBias", label: "Aggression", precision: 2, getValue: (sample) => sample.lineage.averageTraits.aggressionBias },
  { key: "reproductionThreshold", label: "Repro threshold", precision: 1, getValue: (sample) => sample.lineage.averageTraits.reproductionThreshold },
  { key: "mutationRate", label: "Mutation rate", precision: 3, getValue: (sample) => sample.lineage.averageTraits.mutationRate },
  { key: "weightNorm", label: "Weight norm", precision: 2, getValue: (sample) => sample.lineage.neuralWeights.flatWeightL2Norm },
];
const DEFAULT_METRIC = METRICS[0] as MetricDefinition;

export function ArchitectureComparison({ runs }: Props) {
  const [metricKey, setMetricKey] = useState(DEFAULT_METRIC.key);
  const [leftArchitecture, setLeftArchitecture] = useState("");
  const [rightArchitecture, setRightArchitecture] = useState("");
  const samples = useMemo(() => buildSamples(runs), [runs]);
  const architectureOptions = useMemo(() => summarizeArchitectures(samples), [samples]);
  const metric = METRICS.find((candidate) => candidate.key === metricKey) ?? DEFAULT_METRIC;
  const activeLeft = architectureOptions.some((option) => option.key === leftArchitecture)
    ? leftArchitecture
    : architectureOptions[0]?.key ?? "";
  const activeRight = architectureOptions.some((option) => option.key === rightArchitecture)
    ? rightArchitecture
    : architectureOptions.find((option) => option.key !== activeLeft)?.key ?? architectureOptions[1]?.key ?? "";
  const leftValues = useMemo(
    () => collectMetricValues(samples, activeLeft, metric),
    [activeLeft, metric, samples],
  );
  const rightValues = useMemo(
    () => collectMetricValues(samples, activeRight, metric),
    [activeRight, metric, samples],
  );
  const leftStats = useMemo(() => groupStats(leftValues), [leftValues]);
  const rightStats = useMemo(() => groupStats(rightValues), [rightValues]);
  const test = useMemo(() => welchTTest(leftValues, rightValues), [leftValues, rightValues]);
  const sameArchitecture = activeLeft !== "" && activeLeft === activeRight;

  return (
    <section className="panel architecture-comparison-panel">
      <div className="architecture-comparison-head">
        <div>
          <div className="panel-title">Architecture T-Test</div>
          <div className="fixed-contract">Compares surviving lineage samples by NN architecture with Welch&apos;s t-test.</div>
        </div>
        <AnalysisHelp help="Choose one metric and two NN architectures. The bars show each architecture's mean among surviving lineages, with standard error whiskers. The p-value estimates whether the two means differ more than expected from sample variation." />
      </div>

      <div className="architecture-comparison-controls">
        <SelectField label="Metric" value={metric.key} disabled={samples.length === 0} onChange={setMetricKey}>
          {METRICS.map((option) => (
            <option value={option.key} key={option.key}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Group A" value={activeLeft} disabled={architectureOptions.length === 0} onChange={setLeftArchitecture}>
          {architectureOptions.length === 0 ? <option value="">No surviving lineages</option> : null}
          {architectureOptions.map((option) => (
            <option value={option.key} key={option.key}>
              {option.label} ({option.count})
            </option>
          ))}
        </SelectField>
        <SelectField label="Group B" value={activeRight} disabled={architectureOptions.length < 2} onChange={setRightArchitecture}>
          {architectureOptions.length < 2 ? <option value="">Need 2 architectures</option> : null}
          {architectureOptions.map((option) => (
            <option value={option.key} key={option.key}>
              {option.label} ({option.count})
            </option>
          ))}
        </SelectField>
      </div>

      {samples.length === 0 ? (
        <div className="chart-empty">Load or run a batch to compare architectures</div>
      ) : sameArchitecture ? (
        <div className="analysis-note">Choose two different architectures to run a comparison.</div>
      ) : (
        <>
          <TTestChart
            metric={metric}
            leftLabel={shortArchitectureLabel(activeLeft, architectureOptions)}
            rightLabel={shortArchitectureLabel(activeRight, architectureOptions)}
            leftStats={leftStats}
            rightStats={rightStats}
          />
          <TTestReadout metric={metric} leftStats={leftStats} rightStats={rightStats} test={test} />
          {leftStats.n < 2 || rightStats.n < 2 ? (
            <div className="analysis-note">Need at least 2 surviving lineage samples in both groups for Welch&apos;s t-test.</div>
          ) : null}
          {test && (leftStats.n < 5 || rightStats.n < 5) ? (
            <div className="analysis-note">Weak evidence: one or both architecture groups has fewer than 5 surviving lineage samples.</div>
          ) : null}
        </>
      )}
    </section>
  );
}

function buildSamples(runs: BatchRunSummary[]): ComparisonSample[] {
  return runs.flatMap((run) =>
    run.survivingLineages.map((lineage) => ({
      key: `${run.runIndex}:${lineage.lineageId}`,
      architectureKey: architectureKey(lineage),
      architectureLabel: architectureLabel(lineage),
      lineage,
    })),
  );
}

function summarizeArchitectures(samples: ComparisonSample[]) {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const sample of samples) {
    const current = counts.get(sample.architectureKey);
    if (current) {
      current.count += 1;
    } else {
      counts.set(sample.architectureKey, {
        key: sample.architectureKey,
        label: sample.architectureLabel,
        count: 1,
      });
    }
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function collectMetricValues(samples: ComparisonSample[], architecture: string, metric: MetricDefinition) {
  return samples
    .filter((sample) => sample.architectureKey === architecture)
    .map(metric.getValue)
    .filter(Number.isFinite);
}

function SelectField({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="architecture-select-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function TTestChart({
  metric,
  leftLabel,
  rightLabel,
  leftStats,
  rightStats,
}: {
  metric: MetricDefinition;
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

function TTestReadout({
  metric,
  leftStats,
  rightStats,
  test,
}: {
  metric: MetricDefinition;
  leftStats: GroupStats;
  rightStats: GroupStats;
  test: TTestResult | null;
}) {
  return (
    <div className="ttest-readout-grid">
      <ReadoutMetric label="A mean" value={formatNumber(leftStats.mean, metric.precision)} sublabel={`n ${leftStats.n} · SEM ${formatNumber(leftStats.standardError, metric.precision)}`} />
      <ReadoutMetric label="B mean" value={formatNumber(rightStats.mean, metric.precision)} sublabel={`n ${rightStats.n} · SEM ${formatNumber(rightStats.standardError, metric.precision)}`} />
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

function AnalysisHelp({ help }: { help: string }) {
  return (
    <span className="analysis-help">
      <button type="button" className="analysis-help-button" aria-label="Architecture t-test help">
        <CircleHelp size={14} />
      </button>
      <span className="analysis-help-bubble" role="tooltip">
        {help}
      </span>
    </span>
  );
}

function shortArchitectureLabel(key: string, options: { key: string; label: string }[]) {
  return options.find((option) => option.key === key)?.label ?? "No architecture";
}

function formatNumber(value: number, precision: number) {
  if (!Number.isFinite(value)) {
    if (value === Number.POSITIVE_INFINITY) return "∞";
    if (value === Number.NEGATIVE_INFINITY) return "-∞";
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
