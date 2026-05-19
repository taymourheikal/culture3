import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BatchSummary } from "../sim/batch";
import {
  deleteBatchExperiment,
  listBatchExperiments,
  loadBatchExperiment,
  type SavedBatchExperiment,
} from "./persistence";

type Props = {
  disabled: boolean;
  refreshKey?: number;
  onLoad: (summary: BatchSummary, experiment: SavedBatchExperiment) => void;
};

export function SavedBatchesPanel({ disabled, refreshKey = 0, onLoad }: Props) {
  const [experiments, setExperiments] = useState<SavedBatchExperiment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState("Not loaded");
  const selected = experiments.find((experiment) => experiment.id === selectedId) ?? experiments[0] ?? null;
  const selectedIsActive = selected ? isActiveStatus(selected.status) : false;

  const refresh = async () => {
    setStatus("Loading saved batches");
    const result = await listBatchExperiments(50);
    setExperiments(result.experiments);
    setSelectedId((current) => {
      if (current && result.experiments.some((experiment) => experiment.id === current)) return current;
      return result.experiments[0]?.id ?? null;
    });
    setStatus(result.ok ? `${result.experiments.length} saved batches` : `Load failed: ${result.message}`);
  };

  useEffect(() => {
    void refresh();
  }, [refreshKey]);

  const loadSelected = async () => {
    if (!selected) return;
    setStatus(`Loading experiment ${selected.id}`);
    const result = await loadBatchExperiment(selected.id);
    if (!result.ok || !result.summary) {
      setStatus(`Load failed: ${result.message}`);
      return;
    }
    onLoad(result.summary, selected);
    setStatus(`Loaded experiment ${selected.id}`);
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (isActiveStatus(selected.status)) {
      setStatus("Cancel or wait for this batch before deleting it");
      return;
    }
    setStatus(`Deleting experiment ${selected.id}`);
    const result = await deleteBatchExperiment(selected.id);
    if (!result.ok) {
      setStatus(`Delete failed: ${result.message}`);
      return;
    }
    setStatus(`Deleted experiment ${selected.id}`);
    await refresh();
  };

  return (
    <section className="panel saved-batches-panel">
      <div className="saved-batches-head">
        <div>
          <div className="panel-title">Saved Batches</div>
          <div className="fixed-contract">{status}</div>
        </div>
        <button type="button" className="save-group-button" title="Refresh saved batches" onClick={refresh} disabled={disabled}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="saved-batches-list">
        {experiments.map((experiment) => (
          <button
            type="button"
            className={selected?.id === experiment.id ? "saved-batch-row active" : "saved-batch-row"}
            key={experiment.id}
            onClick={() => setSelectedId(experiment.id)}
            disabled={disabled}
          >
            <span>#{experiment.id}</span>
            <span>{formatDate(experiment.created_at)}</span>
            <span>{experiment.status}</span>
            <span>{experiment.completed_runs}/{experiment.requested_runs}</span>
            <span>{experiment.stop_tick.toLocaleString()}</span>
            <span>{experiment.base_seed}</span>
            <span>{experiment.aggregate.averageSurvivingLineages}</span>
          </button>
        ))}
        {experiments.length === 0 ? <div className="empty-state saved-batches-empty">No saved batches</div> : null}
      </div>

      <div className="saved-batches-columns">
        <span>ID</span>
        <span>Created</span>
        <span>Status</span>
        <span>Runs</span>
        <span>Stop</span>
        <span>Seed</span>
        <span>Avg L</span>
      </div>

      <div className="saved-batches-actions">
        <button type="button" className="command-button" onClick={loadSelected} disabled={disabled || !selected}>
          <Download size={16} />
          Load
        </button>
        <button
          type="button"
          className="command-button danger-button"
          onClick={deleteSelected}
          disabled={disabled || !selected || selectedIsActive}
          title={selectedIsActive ? "Cancel or wait for this batch before deleting it" : "Delete selected batch"}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </section>
  );
}

function isActiveStatus(status: SavedBatchExperiment["status"]) {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
