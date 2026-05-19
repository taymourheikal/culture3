import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildBatchSummary,
  summarizeBatchAggregate,
  type BatchRunSummary,
  type BatchSummary,
} from "../sim/batch";
import type { SimulationParameters } from "../sim/types";
import {
  cancelBatchJob,
  loadBatchExperiment,
  loadBatchJob,
  startBatchJob,
  type SavedBatchExperiment,
} from "./persistence";

export type BatchDraft = {
  runs: number;
  stopTick: number;
  seed: number;
};

export type ProgressState = {
  status: "idle" | "queued" | "running" | "cancel_requested" | "complete" | "cancelled" | "failed";
  runIndex: number;
  tick: number;
};

export function useBatchJob(parameters: SimulationParameters) {
  const [draft, setDraft] = useState<BatchDraft>({
    runs: 10,
    stopTick: 1000,
    seed: parameters.runtime.initialSeed,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ status: "idle", runIndex: 0, tick: 0 });
  const [runs, setRuns] = useState<BatchRunSummary[]>([]);
  const [selectedRunIndex, setSelectedRunIndex] = useState<number | null>(null);
  const [selectedLineageId, setSelectedLineageId] = useState<number | null>(null);
  const [resultParameters, setResultParameters] = useState(parameters);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState("No batch saved yet");
  const [savedBatchesRefreshKey, setSavedBatchesRefreshKey] = useState(0);
  const pollTimeoutRef = useRef<number | null>(null);

  const aggregate = useMemo(() => summarizeBatchAggregate(runs, draft.stopTick), [draft.stopTick, runs]);
  const selectedRun = useMemo(
    () => runs.find((run) => run.runIndex === selectedRunIndex) ?? runs[0] ?? null,
    [runs, selectedRunIndex],
  );
  const selectedLineage = useMemo(() => {
    if (!selectedRun) return null;
    return (
      selectedRun.survivingLineages.find((lineage) => lineage.lineageId === selectedLineageId) ??
      selectedRun.survivingLineages[0] ??
      null
    );
  }, [selectedLineageId, selectedRun]);
  const outputJson = useMemo(
    () =>
      JSON.stringify(
        buildBatchSummary(
          {
            runs: draft.runs,
            stopTick: draft.stopTick,
            seed: draft.seed,
          },
          resultParameters,
          runs,
        ),
        null,
        2,
      ),
    [draft.runs, draft.seed, draft.stopTick, resultParameters, runs],
  );

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const startBatch = async () => {
    if (running) return;
    const options = sanitizeDraft(draft);
    const batchParameters = structuredClone(parameters);
    setDraft(options);
    setRuns([]);
    setSelectedRunIndex(null);
    setSelectedLineageId(null);
    setResultParameters(batchParameters);
    setSaveStatus("Starting server batch job");
    setRunning(true);
    setProgress({ status: "queued", runIndex: 0, tick: 0 });

    const result = await startBatchJob(options, batchParameters);
    if (!result.ok || !result.jobId || !result.experimentId) {
      setRunning(false);
      setProgress({ status: "failed", runIndex: 0, tick: 0 });
      setSaveStatus(`Start failed: ${result.message}`);
      return;
    }
    setActiveJobId(result.jobId);
    setSaveStatus(`Server job ${result.jobId} saving to experiment ${result.experimentId}`);
    setSavedBatchesRefreshKey((key) => key + 1);
    void pollBatchJob(result.jobId, result.experimentId);
  };

  const stopBatch = async () => {
    if (!activeJobId) return;
    const result = await cancelBatchJob(activeJobId);
    setSaveStatus(result.ok ? `Cancel requested for job ${activeJobId}` : `Cancel failed: ${result.message}`);
  };

  const loadSavedBatch = (summary: BatchSummary, experiment: SavedBatchExperiment) => {
    if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    setActiveJobId(null);
    setRunning(false);
    setDraft({
      runs: summary.options.runs,
      stopTick: summary.options.stopTick,
      seed: summary.options.seed,
    });
    setRuns(summary.runs);
    setResultParameters(summary.parameters);
    const firstRun = summary.runs[0] ?? null;
    setSelectedRunIndex(firstRun?.runIndex ?? null);
    setSelectedLineageId(firstRun?.survivingLineages[0]?.lineageId ?? null);
    setProgress({
      status: "complete",
      runIndex: Math.max(0, summary.runs.length - 1),
      tick: summary.options.stopTick,
    });
    setSaveStatus(`Loaded experiment ${experiment.id}`);
    if ((experiment.status === "queued" || experiment.status === "running" || experiment.status === "cancel_requested") && experiment.job_id) {
      setActiveJobId(experiment.job_id);
      setRunning(true);
      setSaveStatus(`Reconnected to server job ${experiment.job_id}`);
      void pollBatchJob(experiment.job_id, experiment.id);
    }
  };

  const selectRun = (run: BatchRunSummary) => {
    setSelectedRunIndex(run.runIndex);
    setSelectedLineageId(run.survivingLineages[0]?.lineageId ?? null);
  };

  const pollBatchJob = async (jobId: number, experimentId: number) => {
    const jobResult = await loadBatchJob(jobId);
    if (!jobResult.ok || !jobResult.job) {
      setRunning(false);
      setProgress((current) => ({ ...current, status: "failed" }));
      setSaveStatus(`Job poll failed: ${jobResult.message}`);
      return;
    }

    const job = jobResult.job;
    setProgress({
      status: job.status,
      runIndex: job.current_run_index,
      tick: job.current_tick,
    });

    const summaryResult = await loadBatchExperiment(experimentId);
    if (summaryResult.ok && summaryResult.summary) {
      setRuns(summaryResult.summary.runs);
      setResultParameters(summaryResult.summary.parameters);
      setSelectedRunIndex((current) => current ?? summaryResult.summary?.runs[0]?.runIndex ?? null);
      setSelectedLineageId((current) => current ?? summaryResult.summary?.runs[0]?.survivingLineages[0]?.lineageId ?? null);
    }

    if (job.status === "complete" || job.status === "cancelled" || job.status === "failed") {
      setRunning(false);
      setActiveJobId(null);
      setSavedBatchesRefreshKey((key) => key + 1);
      setSaveStatus(
        job.status === "failed"
          ? `Job ${jobId} failed: ${job.error ?? "Unknown error"}`
          : `Saved experiment ${experimentId}`,
      );
      return;
    }

    pollTimeoutRef.current = window.setTimeout(() => {
      void pollBatchJob(jobId, experimentId);
    }, 750);
  };

  return {
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
    selectLineage: setSelectedLineageId,
  };
}

export function sanitizeDraft(draft: BatchDraft): BatchDraft {
  return {
    runs: Math.max(1, Math.floor(Number.isFinite(draft.runs) ? draft.runs : 1)),
    stopTick: Math.max(1, Math.floor(Number.isFinite(draft.stopTick) ? draft.stopTick : 1)),
    seed: Math.max(0, Math.floor(Number.isFinite(draft.seed) ? draft.seed : 0)),
  };
}
