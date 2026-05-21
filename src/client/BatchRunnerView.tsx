import { Download, Play, Square } from "lucide-react";
import type { BatchRunSummary, SurvivingLineageSummary } from "../sim/batch";
import type { SimulationParameters } from "../sim/types";
import { AppModeTabs, type AppMode } from "./AppModeTabs";
import { ArchitectureComparison } from "./ArchitectureComparison";
import { BatchVisualizations } from "./BatchVisualizations";
import { BatchWeightAnalysis } from "./BatchWeightAnalysis";
import { SavedBatchesPanel } from "./SavedBatchesPanel";
import { sanitizeDraft, useBatchJob, type BatchDraft, type ProgressState } from "./useBatchJob";

type Props = {
  parameters: SimulationParameters;
  activeMode: AppMode;
  onModeChange: (mode: AppMode) => void;
};

export function BatchRunnerView({ parameters, activeMode, onModeChange }: Props) {
  const batch = useBatchJob(parameters);
  const {
    draft,
    setDraft,
    running,
    progress,
    runs,
    aggregate,
    selectedRun,
    selectedLineage,
    saveStatus,
    savedBatchesRefreshKey,
    outputJson,
    startBatch,
    stopBatch,
    loadSavedBatch,
    selectRun,
    selectLineage,
  } = batch;

  const saveJson = () => {
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `batch-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="batch-shell">
      <header className="batch-header">
        <div className="brand-cluster">
          <div>
            <span className="eyebrow">Emergent Ant World</span>
            <h1>Batch Experiments</h1>
          </div>
          <AppModeTabs activeMode={activeMode} onChange={onModeChange} />
        </div>
        <div className="batch-actions">
          <button type="button" className="command-button" onClick={startBatch} disabled={running}>
            <Play size={16} />
            Run
          </button>
          <button type="button" className="command-button" onClick={stopBatch} disabled={!running}>
            <Square size={16} />
            Stop
          </button>
          <button type="button" className="command-button" onClick={saveJson} disabled={runs.length === 0}>
            <Download size={16} />
            JSON
          </button>
        </div>
      </header>

      <section className="batch-grid">
        <div className="batch-left">
          <section className="panel batch-controls-panel">
            <div className="panel-title">Run Controls</div>
            <div className="batch-fields">
              <NumberField label="Runs" value={draft.runs} step={1} disabled={running} onChange={(runs) => setDraft({ ...draft, runs })} />
              <NumberField
                label="Stop tick"
                value={draft.stopTick}
                step={100}
                disabled={running}
                onChange={(stopTick) => setDraft({ ...draft, stopTick })}
              />
              <NumberField label="Base seed" value={draft.seed} step={1} disabled={running} onChange={(seed) => setDraft({ ...draft, seed })} />
            </div>
            <div className="batch-progress">
              <div>
                <span>Status</span>
                <strong>{progress.status}</strong>
              </div>
              <div>
                <span>Run</span>
                <strong>{runs.length}/{sanitizeDraft(draft).runs}</strong>
              </div>
              <div>
                <span>Current tick</span>
                <strong>{progress.tick.toLocaleString()}</strong>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${completionPercent(runs.length, progress, sanitizeDraft(draft))}%` }} />
            </div>
            <div className="save-state batch-save-state">
              <span>{saveStatus}</span>
            </div>
          </section>

          <SavedBatchesPanel disabled={running} refreshKey={savedBatchesRefreshKey} onLoad={loadSavedBatch} />

          <section className="panel">
            <div className="panel-title">Aggregate</div>
            <div className="batch-metric-grid">
              <Metric label="Completed" value={String(aggregate.runs)} />
              <Metric label="Avg population" value={String(aggregate.averagePopulation)} />
              <Metric label="Avg lineages" value={String(aggregate.averageSurvivingLineages)} />
              <Metric label="Avg max gen" value={String(aggregate.averageMaxGeneration)} />
              <Metric label="Avg food" value={String(aggregate.averageFood)} />
              <Metric label="Extinction rate" value={String(aggregate.extinctionRate)} />
            </div>
          </section>

          <section className="panel batch-results-panel">
            <div className="panel-title">Runs</div>
            <div className="batch-table">
              <div className="batch-table-row batch-table-head">
                <span>Run</span>
                <span>Seed</span>
                <span>Pop</span>
                <span>Lineages</span>
                <span>Max Gen</span>
              </div>
              {runs.map((run) => (
                <button
                  type="button"
                  className={selectedRun?.runIndex === run.runIndex ? "batch-table-row active" : "batch-table-row"}
                  key={run.runIndex}
                  onClick={() => selectRun(run)}
                >
                  <span>{run.runIndex + 1}</span>
                  <span>{run.seed}</span>
                  <span>{run.population}</span>
                  <span>{run.survivingLineageCount}</span>
                  <span>{run.maxGeneration}</span>
                </button>
              ))}
              {runs.length === 0 ? <div className="empty-state">No completed runs</div> : null}
            </div>
          </section>
        </div>

        <div className="batch-right">
          <BatchWeightAnalysis runs={runs} />
          <ArchitectureComparison runs={runs} />
          <LineageSummaryPanel
            run={selectedRun}
            selectedLineage={selectedLineage}
            onSelectLineage={selectLineage}
          />
        </div>
      </section>
      <BatchVisualizations runs={runs} />
      <section className="panel batch-json-panel">
        <div className="panel-title">Selected Lineage JSON</div>
        <pre>{selectedLineage ? JSON.stringify(selectedLineage, null, 2) : "Run a batch to inspect surviving lineage output."}</pre>
      </section>
    </main>
  );
}

function LineageSummaryPanel({
  run,
  selectedLineage,
  onSelectLineage,
}: {
  run: BatchRunSummary | null;
  selectedLineage: SurvivingLineageSummary | null;
  onSelectLineage: (lineageId: number) => void;
}) {
  return (
    <section className="panel batch-lineage-panel">
      <div className="panel-title">Surviving Lineages</div>
      {!run ? (
        <div className="empty-state">No run selected</div>
      ) : (
        <>
          <div className="lineage-chip-row">
            {run.survivingLineages.map((lineage) => (
              <button
                type="button"
                className={selectedLineage?.lineageId === lineage.lineageId ? "lineage-chip active" : "lineage-chip"}
                key={lineage.lineageId}
                onClick={() => onSelectLineage(lineage.lineageId)}
              >
                L{lineage.lineageId}
              </button>
            ))}
          </div>
          {selectedLineage ? (
            <>
              <div className="batch-metric-grid">
                <Metric label="Population" value={String(selectedLineage.population)} />
                <Metric label="Born" value={String(selectedLineage.totalBorn)} />
                <Metric label="Max gen" value={String(selectedLineage.maxGeneration)} />
                <Metric label="Weight norm" value={String(selectedLineage.neuralWeights.flatWeightL2Norm)} />
              </div>
              <div className="architecture-strip">
                <span>{selectedLineage.neuralWeights.architecture.activation}</span>
                <span>H1 {selectedLineage.neuralWeights.architecture.hiddenCount}</span>
                <span>
                  H2 {selectedLineage.neuralWeights.architecture.secondLayerEnabled ? selectedLineage.neuralWeights.architecture.secondHiddenCount : "off"}
                </span>
                <span>{selectedLineage.neuralWeights.flatWeightVector.length} weights</span>
              </div>
              <NeuronTable lineage={selectedLineage} />
            </>
          ) : (
            <div className="empty-state">No surviving lineage</div>
          )}
        </>
      )}
    </section>
  );
}

function NeuronTable({ lineage }: { lineage: SurvivingLineageSummary }) {
  return (
    <div className="neuron-table">
      <div className="neuron-table-row neuron-table-head">
        <span>Layer</span>
        <span>Neuron</span>
        <span>Bias</span>
        <span>Avg |w|</span>
      </div>
      {lineage.neuralWeights.layers.hiddenLayer1.neurons.map((neuron) => (
        <NeuronRow key={`h1-${neuron.index}`} layer="H1" neuron={neuron.neuron} bias={neuron.bias} weights={neuron.inputWeights} />
      ))}
      {lineage.neuralWeights.layers.hiddenLayer2?.neurons.map((neuron) => (
        <NeuronRow key={`h2-${neuron.index}`} layer="H2" neuron={neuron.neuron} bias={neuron.bias} weights={neuron.inputWeights} />
      ))}
      {lineage.neuralWeights.layers.outputLayer.outputs.map((node) => (
        <NeuronRow key={`out-${node.index}`} layer={node.output} neuron={node.neuron} bias={node.bias} weights={node.inputWeights} />
      ))}
    </div>
  );
}

function NeuronRow({ layer, neuron, bias, weights }: { layer: string; neuron: number; bias: number; weights: number[] }) {
  return (
    <div className="neuron-table-row">
      <span>{layer}</span>
      <span>{neuron}</span>
      <span>{bias}</span>
      <span>{averageAbsolute(weights)}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-field">
      <span>{label}</span>
      <input type="number" min={1} step={step} value={String(value)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function completionPercent(completedRuns: number, progress: ProgressState, draft: BatchDraft) {
  const currentRunProgress = progress.status === "running" ? Math.min(1, progress.tick / draft.stopTick) : 0;
  return Math.min(100, ((completedRuns + currentRunProgress) / draft.runs) * 100);
}

function averageAbsolute(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length).toFixed(6));
}
