import { useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { BatchRunSummary } from "../sim/batch";
import {
  architectureCounts,
  behaviorOutputSpread,
  behaviorVector,
  buildWeightSamples,
  clusterWeightSamples,
  collectWeights,
  filterWeightSamples,
  histogram,
  pairwiseDistances,
  summarizeDistances,
  type SummaryStats,
  type WeightSample,
} from "./batchAnalysis";
import { HistogramBars, ScopeButton, type LineageScope } from "./charts";

type Props = {
  runs: BatchRunSummary[];
};

export function BatchWeightAnalysis({ runs }: Props) {
  const [scope, setScope] = useState<LineageScope>("all");
  const [selectedArchitecture, setSelectedArchitecture] = useState("");
  const [heatmapOrder, setHeatmapOrder] = useState<"clustered" | "run">("clustered");
  const allSamples = useMemo(() => buildWeightSamples(runs), [runs]);
  const scopedSamples = useMemo(() => filterWeightSamples(allSamples, scope), [allSamples, scope]);
  const architectureOptions = useMemo(() => architectureCounts(scopedSamples), [scopedSamples]);
  const activeArchitecture = architectureOptions.some((option) => option.key === selectedArchitecture)
    ? selectedArchitecture
    : architectureOptions[0]?.key ?? "";
  const samples = useMemo(
    () => scopedSamples.filter((sample) => sample.architectureKey === activeArchitecture),
    [activeArchitecture, scopedSamples],
  );
  const allWeights = useMemo(() => collectWeights(samples), [samples]);
  const distribution = useMemo(() => histogram(allWeights, 12, 2), [allWeights]);
  const weightPairs = useMemo(() => pairwiseDistances(samples), [samples]);
  const weightSummary = useMemo(() => summarizeDistances(samples, weightPairs), [samples, weightPairs]);
  const weightDistanceDistribution = useMemo(() => histogram(weightPairs.map((pair) => pair.distance), 10, 2), [weightPairs]);
  const behaviorPairs = useMemo(() => pairwiseDistances(samples, behaviorVector), [samples]);
  const behaviorSummary = useMemo(() => summarizeDistances(samples, behaviorPairs), [samples, behaviorPairs]);
  const behaviorDistanceDistribution = useMemo(() => histogram(behaviorPairs.map((pair) => pair.distance), 10, 2), [behaviorPairs]);
  const outputSpread = useMemo(() => behaviorOutputSpread(samples), [samples]);
  const heatmapSamples = useMemo(
    () => (heatmapOrder === "clustered" ? clusterWeightSamples(samples) : samples),
    [heatmapOrder, samples],
  );
  const weightCount = samples[0]?.vector.length ?? 0;

  return (
    <section className="panel weight-analysis-panel">
      <div className="weight-analysis-head">
        <div>
          <div className="panel-title">Weight Distributions & Heatmaps</div>
          <div className="fixed-contract">
            {samples.length} lineage samples · {weightCount} weights each
          </div>
        </div>
      </div>

      <div className="scope-tabs weight-scope-tabs">
        <ScopeButton label="All" value="all" scope={scope} onChange={setScope} />
        <ScopeButton label="Founders" value="founders" scope={scope} onChange={setScope} />
        <ScopeButton label="Rescue" value="rescue" scope={scope} onChange={setScope} />
      </div>

      <label className="weight-architecture-select">
        <span>Architecture</span>
        <select
          value={activeArchitecture}
          onChange={(event) => setSelectedArchitecture(event.target.value)}
          disabled={architectureOptions.length === 0}
        >
          {architectureOptions.length === 0 ? <option value="">No surviving lineages</option> : null}
          {architectureOptions.map((option) => (
            <option value={option.key} key={option.key}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <div className="weight-panel-grid">
        <ConvergenceSummary weightSummary={weightSummary} behaviorSummary={behaviorSummary} />
        <div className="chart-card">
          <div className="chart-title">Raw Weight Distribution</div>
          {distribution.length === 0 ? <div className="chart-empty">No weights</div> : <HistogramBars bins={distribution} compact />}
        </div>
        <div className="chart-card">
          <SectionHeader
            title="Pairwise NN Distance"
            help="Compares every surviving lineage against every other surviving lineage with the same NN architecture. It measures how far apart their averaged NN weights are. Lower values suggest convergence; wider or higher values suggest different surviving networks."
          />
          <div className="fixed-contract">
            {weightSummary.pairCount} lineage pairs · lower means more similar weights
          </div>
          {weightDistanceDistribution.length === 0 ? (
            <div className="chart-empty">Need at least 2 lineages</div>
          ) : (
            <HistogramBars bins={weightDistanceDistribution} compact />
          )}
        </div>
        <div className="chart-card">
          <SectionHeader
            title="Behavioral Similarity Test"
            help="Runs each surviving lineage through the same fixed test situations, then compares their action outputs. Lower values mean the lineages act more similarly. This helps catch cases where weights differ but behavior is still similar."
          />
          <div className="fixed-contract">
            {behaviorSummary.pairCount} lineage pairs · same fixed test situations for every lineage
          </div>
          {behaviorDistanceDistribution.length === 0 ? (
            <div className="chart-empty">Need at least 2 lineages</div>
          ) : (
            <>
              <HistogramBars bins={behaviorDistanceDistribution} compact />
              <OutputSpread items={outputSpread} />
            </>
          )}
        </div>
        <div className="chart-card">
          <div className="chart-title-row">
            <div className="chart-title">Clustered Weight Heatmap</div>
            <div className="heatmap-head-actions">
              <div className="heatmap-order-tabs">
                <button
                  type="button"
                  className={heatmapOrder === "clustered" ? "scope-tab active" : "scope-tab"}
                  onClick={() => setHeatmapOrder("clustered")}
                >
                  Clustered
                </button>
                <button
                  type="button"
                  className={heatmapOrder === "run" ? "scope-tab active" : "scope-tab"}
                  onClick={() => setHeatmapOrder("run")}
                >
                  Run order
                </button>
              </div>
              <AnalysisHelp
                label="Clustered Weight Heatmap help"
                help="Shows one row per surviving lineage and one column per averaged NN weight. Clustered mode puts similar rows near each other, making groups easier to see. Blocks of similar color suggest similar surviving networks."
              />
            </div>
          </div>
          {samples.length === 0 ? (
            <div className="chart-empty">No matching lineages</div>
          ) : (
            <>
              <WeightHeatmap samples={heatmapSamples} />
              <div className="heatmap-note">
                Rows are surviving lineages. Columns are flattened averaged NN weights. Clustered order groups similar rows.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ConvergenceSummary({ weightSummary, behaviorSummary }: { weightSummary: SummaryStats; behaviorSummary: SummaryStats }) {
  if (weightSummary.sampleCount === 0) {
    return (
      <div className="convergence-summary">
        <div>
          <SectionHeader
            title="Convergence Summary"
            help="Summarizes how similar surviving lineages are for the selected NN architecture. It uses pairwise weight distance and behavioral distance. Lower means more convergence; higher means surviving lineages remain more different."
          />
          <div className="fixed-contract">Architecture-scoped. Lower distances mean surviving lineages are more alike.</div>
        </div>
        <div className="chart-empty">Load or run a batch to compare surviving lineages</div>
      </div>
    );
  }

  return (
    <div className="convergence-summary">
      <div>
        <SectionHeader
          title="Convergence Summary"
          help="Summarizes how similar surviving lineages are for the selected NN architecture. It uses pairwise weight distance and behavioral distance. Lower means more convergence; higher means surviving lineages remain more different."
        />
        <div className="fixed-contract">Architecture-scoped. Lower distances mean surviving lineages are more alike.</div>
      </div>
      <div className="convergence-grid">
        <SummaryMetric label="Samples" value={String(weightSummary.sampleCount)} />
        <SummaryMetric label="Pairs" value={String(weightSummary.pairCount)} />
        <SummaryMetric label="NN mean" value={formatNumber(weightSummary.mean)} />
        <SummaryMetric label="NN median" value={formatNumber(weightSummary.median)} />
        <SummaryMetric label="NN 10-90%" value={`${formatNumber(weightSummary.q10)}-${formatNumber(weightSummary.q90)}`} />
        <SummaryMetric label="NN min-max" value={`${formatNumber(weightSummary.min)}-${formatNumber(weightSummary.max)}`} />
        <SummaryMetric label="NN CV" value={formatNumber(weightSummary.coefficientOfVariation)} />
        <SummaryMetric label="Behavior mean" value={formatNumber(behaviorSummary.mean)} />
        <SummaryMetric label="Behavior median" value={formatNumber(behaviorSummary.median)} />
        <SummaryMetric label="Behavior 10-90%" value={`${formatNumber(behaviorSummary.q10)}-${formatNumber(behaviorSummary.q90)}`} />
        <SummaryMetric label="Behavior min-max" value={`${formatNumber(behaviorSummary.min)}-${formatNumber(behaviorSummary.max)}`} />
        <SummaryMetric label="Behavior CV" value={formatNumber(behaviorSummary.coefficientOfVariation)} />
      </div>
      {weightSummary.sampleCount === 1 ? (
        <div className="analysis-note">Need at least 2 surviving lineage samples to compare convergence.</div>
      ) : null}
      {weightSummary.sampleCount > 1 && weightSummary.sampleCount < 5 ? (
        <div className="analysis-note">Weak evidence: fewer than 5 surviving lineage samples for this architecture.</div>
      ) : null}
    </div>
  );
}

function SectionHeader({ title, help }: { title: string; help: string }) {
  return (
    <div className="analysis-section-head">
      <div className="chart-title">{title}</div>
      <AnalysisHelp label={`${title} help`} help={help} />
    </div>
  );
}

function AnalysisHelp({ label, help }: { label: string; help: string }) {
  return (
    <span className="analysis-help">
      <button type="button" className="analysis-help-button" aria-label={label}>
        <CircleHelp size={14} />
      </button>
      <span className="analysis-help-bubble" role="tooltip">
        {help}
      </span>
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="convergence-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OutputSpread({ items }: { items: { label: string; spread: number }[] }) {
  return (
    <div className="behavior-spread-list">
      <div className="fixed-contract">Most variable outputs in the standardized test</div>
      {items.slice(0, 4).map((item) => (
        <div className="behavior-spread-row" key={item.label}>
          <span>{item.label}</span>
          <strong>{formatNumber(item.spread)}</strong>
        </div>
      ))}
    </div>
  );
}

function WeightHeatmap({ samples }: { samples: WeightSample[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * pixelRatio));
      const height = Math.max(1, Math.floor(rect.height * pixelRatio));
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#14191b";
      context.fillRect(0, 0, width, height);

      const columnCount = samples[0]?.vector.length ?? 0;
      if (columnCount === 0) return;

      let maxAbs = 0.001;
      for (const sample of samples) {
        for (const weight of sample.vector) {
          const abs = Math.abs(weight);
          if (abs > maxAbs) maxAbs = abs;
        }
      }
      const cellWidth = width / columnCount;
      const cellHeight = height / samples.length;

      samples.forEach((sample, rowIndex) => {
        sample.vector.forEach((weight, columnIndex) => {
          context.fillStyle = heatColor(weight / maxAbs);
          context.fillRect(
            Math.floor(columnIndex * cellWidth),
            Math.floor(rowIndex * cellHeight),
            Math.ceil(cellWidth),
            Math.ceil(cellHeight),
          );
        });
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [samples]);

  return <canvas ref={canvasRef} className="weight-heatmap-canvas" />;
}

function heatColor(value: number) {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped < 0) {
    const amount = Math.abs(clamped);
    return mixColor([35, 41, 43], [74, 172, 184], amount);
  }
  return mixColor([35, 41, 43], [219, 181, 91], clamped);
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number) {
  const channels = from.map((channel, index) => Math.round(channel + ((to[index] ?? channel) - channel) * amount));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}
