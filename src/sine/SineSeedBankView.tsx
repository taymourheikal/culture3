import { Check, Database, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import {
  admitSineSeedBankCandidate,
  admitSineSeedBankCandidates,
  createSineSeedBank,
  getSineSeedBankEntry,
  listSineSeedBankCandidateRuns,
  listSineSeedBankCandidates,
  listSineSeedBankEntries,
  listSineSeedBanks,
  updateSineSeedBank,
  type SineSeedBankCandidate,
  type SineSeedBankCandidateFilter,
  type SineSeedBankCandidateSourceRun,
} from "./seedBankApi";
import type { SineSeedBankEntry, SineSeedBankEntrySummary, SineSeedBankRecord } from "./seedBankTypes";
import type { SineView } from "./SineApp";
import { SineHeader } from "./SineHeader";
import { Metric } from "./SineMetric";

type CandidateFilters = {
  minResolvedTrades: number;
  minChildren: number;
  minAgePercentile: number;
  minSharpe: string;
  minSortino: string;
  limit: number;
  offset: number;
};

type CandidateSelectionRef = Pick<SineSeedBankCandidate, "runId" | "spawnerId">;
type BatchSelectionMode = "allFiltered" | null;

const DEFAULT_FILTERS: CandidateFilters = {
  minResolvedTrades: 50,
  minChildren: 0,
  minAgePercentile: 0,
  minSharpe: "",
  minSortino: "",
  limit: 100,
  offset: 0,
};

export function SineSeedBankView({
  activeView,
  onViewChange,
}: {
  activeView: SineView;
  onViewChange: (view: SineView) => void;
}) {
  const [banks, setBanks] = useState<SineSeedBankRecord[]>([]);
  const [activeBankId, setActiveBankId] = useState("");
  const [bankLabel, setBankLabel] = useState("");
  const [bankDescription, setBankDescription] = useState("");
  const [entries, setEntries] = useState<SineSeedBankEntrySummary[]>([]);
  const [entryDetail, setEntryDetail] = useState<SineSeedBankEntry | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [sourceRuns, setSourceRuns] = useState<SineSeedBankCandidateSourceRun[]>([]);
  const [sourceRunTotal, setSourceRunTotal] = useState(0);
  const [sourceRunSearch, setSourceRunSearch] = useState("");
  const [sourceRunOffset, setSourceRunOffset] = useState(0);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<CandidateFilters>(DEFAULT_FILTERS);
  const [candidates, setCandidates] = useState<SineSeedBankCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [admittableCandidateTotal, setAdmittableCandidateTotal] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<Map<string, CandidateSelectionRef>>(() => new Map());
  const [batchSelection, setBatchSelection] = useState<BatchSelectionMode>(null);
  const [status, setStatus] = useState("Loading seed banks...");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSeedBanks()
      .then((loaded) => {
        if (cancelled) return;
        setBanks(loaded);
        const firstBank = loaded[0] ?? null;
        if (firstBank) {
          setActiveBankId(firstBank.id);
          setBankLabel(firstBank.label);
          setBankDescription(firstBank.description);
          setStatus("Seed banks loaded.");
        } else {
          setStatus("Create a seed bank to start admitting candidates.");
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    void loadCandidateRuns({ offset: 0, search: "" })
      .then((response) => {
        if (cancelled) return;
        setSourceRuns(response.runs);
        setSourceRunTotal(response.total);
        setSelectedRunIds(response.runs[0] ? [response.runs[0].id] : []);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const active = banks.find((bank) => bank.id === activeBankId) ?? null;
    setBankLabel(active?.label ?? "");
    setBankDescription(active?.description ?? "");
    clearCandidateSelection();
  }, [activeBankId, banks]);

  useEffect(() => {
    if (!activeBankId) {
      setEntries([]);
      setSelectedEntryId("");
      return;
    }
    let cancelled = false;
    void listSineSeedBankEntries(activeBankId)
      .then((response) => {
        if (cancelled) return;
        setEntries(response.entries);
        setSelectedEntryId((current) => (response.entries.some((entry) => entry.id === current) ? current : response.entries[0]?.id ?? ""));
        setEntryDetail(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [activeBankId]);

  useEffect(() => {
    if (!selectedEntryId) {
      setEntryDetail(null);
      return;
    }
    let cancelled = false;
    void getSineSeedBankEntry(selectedEntryId)
      .then((response) => {
        if (!cancelled) setEntryDetail(response.entry);
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntryId]);

  useEffect(() => {
    if (selectedRunIds.length === 0) {
      setCandidates([]);
      setCandidateTotal(0);
      setAdmittableCandidateTotal(0);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadCandidates(selectedRunIds, activeBankId, filters)
        .then((response) => {
          if (cancelled) return;
          setCandidates(response.rows);
          setCandidateTotal(response.total);
          setAdmittableCandidateTotal(response.admittableTotal);
          const admittedVisibleKeys = new Set(response.rows.filter((row) => row.alreadyAdmitted).map(candidateKey));
          setSelectedCandidates((current) => new Map([...current].filter(([key]) => !admittedVisibleKeys.has(key))));
        })
        .catch((caught) => {
          if (!cancelled) setError(errorMessage(caught));
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [activeBankId, filters, selectedRunIds]);

  const activeBank = banks.find((bank) => bank.id === activeBankId) ?? null;
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;
  const selectedCandidateKeys = new Set(selectedCandidates.keys());
  const pageEnd = Math.min(candidateTotal, filters.offset + candidates.length);
  const selectedLabel = batchSelection === "allFiltered" ? `All filtered (${admittableCandidateTotal.toLocaleString()})` : selectedCandidates.size.toLocaleString();
  const canAdmitSelected = activeBank && selectedCandidates.size > 0 && pendingAction === null;
  const canAdmitAllFiltered = activeBank && selectedRunIds.length > 0 && admittableCandidateTotal > 0 && pendingAction === null;

  const createBank = async () => {
    if (pendingAction !== null) return;
    setPendingAction("create-bank");
    try {
      setError(null);
      const response = await createSineSeedBank({ label: bankLabel || "Untitled seed bank", description: bankDescription });
      const loaded = await loadSeedBanks();
      setBanks(loaded);
      setActiveBankId(response.seedBank.id);
      setStatus("Seed bank created.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const saveBank = async () => {
    if (!activeBank || pendingAction !== null) return;
    setPendingAction("save-bank");
    try {
      setError(null);
      const response = await updateSineSeedBank(activeBank.id, { label: bankLabel || activeBank.label, description: bankDescription });
      setBanks((current) => current.map((bank) => (bank.id === response.seedBank.id ? response.seedBank : bank)));
      setStatus("Seed bank saved.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const refreshCandidates = async () => {
    if (pendingAction !== null) return;
    setPendingAction("refresh-candidates");
    try {
      setError(null);
      const runResponse = await loadCandidateRuns({ offset: sourceRunOffset, search: sourceRunSearch });
      setSourceRuns(runResponse.runs);
      setSourceRunTotal(runResponse.total);
      const response = await loadCandidates(selectedRunIds, activeBankId, filters);
      setCandidates(response.rows);
      setCandidateTotal(response.total);
      setAdmittableCandidateTotal(response.admittableTotal);
      setStatus("Candidates refreshed.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const loadSourceRunPage = async (nextOffset: number, nextSearch = sourceRunSearch) => {
    if (pendingAction !== null) return;
    setPendingAction("source-runs");
    try {
      setError(null);
      const response = await loadCandidateRuns({ offset: nextOffset, search: nextSearch });
      setSourceRuns(response.runs);
      setSourceRunTotal(response.total);
      setSourceRunOffset(response.offset);
      setSourceRunSearch(response.search);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const admitSelected = async () => {
    if (!activeBank || pendingAction !== null) return;
    setPendingAction("admit");
    try {
      setError(null);
      let inserted = 0;
      for (const candidate of selectedCandidates.values()) {
        const response = await admitSineSeedBankCandidate({
          bankId: activeBank.id,
          sourceRunId: candidate.runId,
          sourceSpawnerId: candidate.spawnerId,
          filters: publicAdmissionFilters(filters),
        });
        if (response.inserted) inserted += 1;
      }
      const [entryResponse, candidateResponse] = await Promise.all([
        listSineSeedBankEntries(activeBank.id),
        loadCandidates(selectedRunIds, activeBank.id, filters),
      ]);
      setEntries(entryResponse.entries);
      setSelectedEntryId(entryResponse.entries[0]?.id ?? "");
      setEntryDetail(null);
      setCandidates(candidateResponse.rows);
      setCandidateTotal(candidateResponse.total);
      setAdmittableCandidateTotal(candidateResponse.admittableTotal);
      clearCandidateSelection();
      setStatus(`${inserted} candidate${inserted === 1 ? "" : "s"} admitted.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const admitAllFiltered = async () => {
    if (!activeBank || selectedRunIds.length === 0 || pendingAction !== null) return;
    setPendingAction("admit-all");
    try {
      setError(null);
      const response = await admitSineSeedBankCandidates({
        bankId: activeBank.id,
        runIds: selectedRunIds,
        filters: publicAdmissionFilters(filters),
      });
      const [entryResponse, candidateResponse] = await Promise.all([
        listSineSeedBankEntries(activeBank.id),
        loadCandidates(selectedRunIds, activeBank.id, filters),
      ]);
      setEntries(entryResponse.entries);
      setSelectedEntryId(entryResponse.entries[0]?.id ?? "");
      setEntryDetail(null);
      setCandidates(candidateResponse.rows);
      setCandidateTotal(candidateResponse.total);
      setAdmittableCandidateTotal(candidateResponse.admittableTotal);
      clearCandidateSelection();
      setStatus(
        `${response.inserted.toLocaleString()} admitted from ${response.matched.toLocaleString()} matches; ` +
          `${response.alreadyAdmitted.toLocaleString()} already admitted, ${response.failed.toLocaleString()} failed.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  };

  const toggleRun = (runId: string) => {
    setFilters((current) => ({ ...current, offset: 0 }));
    clearCandidateSelection();
    setSelectedRunIds((current) => (current.includes(runId) ? current.filter((id) => id !== runId) : [...current, runId]));
  };

  const updateFilter = <K extends keyof CandidateFilters>(key: K, value: CandidateFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, offset: key === "offset" ? Number(value) : 0 }));
    if (key !== "offset") clearCandidateSelection();
  };

  const toggleCandidate = (candidate: SineSeedBankCandidate) => {
    if (candidate.alreadyAdmitted) return;
    const key = candidateKey(candidate);
    setSelectedCandidates((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, { runId: candidate.runId, spawnerId: candidate.spawnerId });
      return next;
    });
    setBatchSelection(null);
  };

  const selectPage = () => {
    setSelectedCandidates((current) => {
      const next = new Map(current);
      for (const candidate of candidates) {
        if (!candidate.alreadyAdmitted) next.set(candidateKey(candidate), { runId: candidate.runId, spawnerId: candidate.spawnerId });
      }
      return next;
    });
    setBatchSelection(null);
  };

  const selectAllFiltered = () => {
    setSelectedCandidates(new Map());
    setBatchSelection("allFiltered");
  };

  function clearCandidateSelection() {
    setSelectedCandidates(new Map());
    setBatchSelection(null);
  }

  return (
    <main className="sine-shell sine-seed-bank-shell">
      <SineHeader activeView={activeView} currentSignal={0} showReadout={false} onViewChange={onViewChange} />
      {error ? <div className="sine-error-banner">{error}</div> : null}

      <section className="sine-seed-bank-main">
        <section className="sine-workbench-panel emphasis">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Seed Bank</span>
              <h2>{activeBank?.label ?? "No active bank"}</h2>
            </div>
            <strong>{entries.length.toLocaleString()} entries</strong>
          </div>
          <div className="sine-workbench-mini-grid">
            <Metric label="Banks" value={String(banks.length)} />
            <Metric label="Candidate runs" value={String(sourceRuns.length)} />
            <Metric label="Visible candidates" value={`${candidates.length.toLocaleString()} / ${candidateTotal.toLocaleString()}`} />
            <Metric label="Selected" value={selectedLabel} />
          </div>
          <div className="sine-history-empty">{status}</div>
        </section>

        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Candidates</span>
              <h2>Headless agents</h2>
            </div>
            <button type="button" onClick={refreshCandidates} disabled={pendingAction !== null}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <div className="sine-runs-fields">
            <label className="sine-select-field">
              <span>Search source runs</span>
              <input
                value={sourceRunSearch}
                placeholder="Run ID, status, seed, date"
                onChange={(event) => {
                  setSourceRunSearch(event.target.value);
                  setSourceRunOffset(0);
                }}
              />
            </label>
            <button type="button" onClick={() => void loadSourceRunPage(0)} disabled={pendingAction !== null}>
              Search
            </button>
          </div>
          <div className="sine-seed-bank-run-list">
            {sourceRuns.map((run) => (
              <label key={run.id} className="sine-seed-bank-run-chip">
                <input type="checkbox" checked={selectedRunIds.includes(run.id)} onChange={() => toggleRun(run.id)} />
                <span>{shortId(run.id)}</span>
                <small>{run.reconstructableAgents} agents / {run.reconstructionSnapshots} snapshots</small>
              </label>
            ))}
            {sourceRuns.length === 0 ? <div className="sine-history-empty">No reconstructable headless runs are available.</div> : null}
          </div>
          <div className="sine-workbench-actions">
            <button type="button" onClick={() => void loadSourceRunPage(Math.max(0, sourceRunOffset - SOURCE_RUN_PAGE_SIZE))} disabled={sourceRunOffset === 0 || pendingAction !== null}>
              Previous runs
            </button>
            <span className="sine-muted">
              {sourceRunTotal === 0 ? "0 source runs" : `${sourceRunOffset + 1}-${Math.min(sourceRunTotal, sourceRunOffset + sourceRuns.length)} of ${sourceRunTotal}`}
            </span>
            <button
              type="button"
              onClick={() => void loadSourceRunPage(sourceRunOffset + SOURCE_RUN_PAGE_SIZE)}
              disabled={sourceRunOffset + sourceRuns.length >= sourceRunTotal || pendingAction !== null}
            >
              Next runs
            </button>
          </div>
          <div className="sine-runs-fields">
            <NumberInput label="Minimum resolved trades" value={filters.minResolvedTrades} min={0} step={1} onChange={(value) => updateFilter("minResolvedTrades", value)} />
            <NumberInput label="Minimum children" value={filters.minChildren} min={0} step={1} onChange={(value) => updateFilter("minChildren", value)} />
            <NumberInput label="Minimum whole-run age percentile" value={filters.minAgePercentile} min={0} max={100} step={25} onChange={(value) => updateFilter("minAgePercentile", value)} />
            <TextNumberInput label="Minimum Sharpe" value={filters.minSharpe} onChange={(value) => updateFilter("minSharpe", value)} />
            <TextNumberInput label="Minimum Sortino" value={filters.minSortino} onChange={(value) => updateFilter("minSortino", value)} />
            <NumberInput label="Candidate limit" value={filters.limit} min={1} max={500} step={25} onChange={(value) => updateFilter("limit", value)} />
          </div>
          <div className="sine-history-empty">Age exposure is percentile-ranked across the full source run, not recalculated from the filtered candidate set.</div>
          <div className="sine-history-empty">
            {candidateTotal.toLocaleString()} agents match current filters. {admittableCandidateTotal.toLocaleString()} are not yet admitted.
          </div>
          <CandidateTable candidates={candidates} selectedCandidateKeys={selectedCandidateKeys} onToggle={toggleCandidate} />
          <div className="sine-workbench-actions">
            <button type="button" onClick={() => updateFilter("offset", Math.max(0, filters.offset - filters.limit))} disabled={filters.offset === 0 || pendingAction !== null}>
              Previous
            </button>
            <span className="sine-muted">{candidateTotal === 0 ? "0 candidates" : `${filters.offset + 1}-${pageEnd} of ${candidateTotal}`}</span>
            <button type="button" onClick={() => updateFilter("offset", filters.offset + filters.limit)} disabled={pageEnd >= candidateTotal || pendingAction !== null}>
              Next
            </button>
            <button type="button" onClick={selectPage} disabled={pendingAction !== null || candidates.every((candidate) => candidate.alreadyAdmitted)}>
              Select Page
            </button>
            <button type="button" onClick={selectAllFiltered} disabled={pendingAction !== null || admittableCandidateTotal === 0}>
              Select All Filtered
            </button>
            <button type="button" onClick={admitSelected} disabled={!canAdmitSelected}>
              <Check size={14} />
              {pendingAction === "admit" ? "Admitting" : "Admit Selected"}
            </button>
            <button type="button" onClick={admitAllFiltered} disabled={!canAdmitAllFiltered}>
              <Check size={14} />
              {pendingAction === "admit-all" ? "Admitting all" : "Admit All Filtered"}
            </button>
          </div>
        </section>
      </section>

      <aside className="sine-seed-bank-side">
        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Banks</span>
              <h2>Collections</h2>
            </div>
            <Database size={16} />
          </div>
          <label className="sine-select-field">
            <span>Active seed bank</span>
            <select
              value={activeBankId}
              onChange={(event) => {
                setActiveBankId(event.target.value);
                clearCandidateSelection();
              }}
            >
              <option value="">New seed bank</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sine-select-field">
            <span>Label</span>
            <input value={bankLabel} onChange={(event) => setBankLabel(event.target.value)} placeholder="Seed bank label" />
          </label>
          <label className="sine-select-field">
            <span>Description</span>
            <textarea value={bankDescription} onChange={(event) => setBankDescription(event.target.value)} placeholder="Selection intent, market context, notes" />
          </label>
          <div className="sine-workbench-actions">
            <button type="button" onClick={createBank} disabled={pendingAction !== null || !bankLabel.trim()}>
              <Database size={14} />
              Create
            </button>
            <button type="button" onClick={saveBank} disabled={pendingAction !== null || !activeBank || !bankLabel.trim()}>
              <Save size={14} />
              Save
            </button>
          </div>
        </section>

        <section className="sine-workbench-panel">
          <div className="sine-workbench-panel-head">
            <div>
              <span className="sine-eyebrow">Entries</span>
              <h2>Frozen agents</h2>
            </div>
            <strong>{entries.length}</strong>
          </div>
          <div className="sine-seed-bank-entry-list">
            {entries.map((entry) => (
              <button key={entry.id} type="button" className={entry.id === selectedEntry?.id ? "active" : ""} onClick={() => setSelectedEntryId(entry.id)}>
                <span>Spawner #{entry.source.spawnerId}</span>
                <small>{shortId(entry.source.runId)} / {entry.reconstructionSnapshotCount} snapshots</small>
              </button>
            ))}
            {entries.length === 0 ? <div className="sine-history-empty">No frozen entries yet.</div> : null}
          </div>
          {selectedEntry ? <EntryDetail entry={entryDetail} summary={selectedEntry} /> : null}
        </section>
      </aside>
    </main>
  );
}

function CandidateTable({
  candidates,
  selectedCandidateKeys,
  onToggle,
}: {
  candidates: SineSeedBankCandidate[];
  selectedCandidateKeys: Set<string>;
  onToggle: (candidate: SineSeedBankCandidate) => void;
}) {
  if (candidates.length === 0) return <div className="sine-history-empty">No candidates match the current filters.</div>;
  return (
    <div className="sine-seed-bank-table-wrap">
      <table className="sine-seed-bank-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Run</th>
            <th>Agent</th>
            <th>Lineage</th>
            <th>Children</th>
            <th>Trades</th>
            <th>Age pct</th>
            <th>Sharpe</th>
            <th>Sortino</th>
            <th>Hit</th>
            <th>Avg payoff</th>
            <th>Snapshots</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => {
            const key = candidateKey(candidate);
            return (
              <tr key={key} className={candidate.alreadyAdmitted ? "muted" : ""}>
                <td>
                  <input type="checkbox" checked={selectedCandidateKeys.has(key)} disabled={candidate.alreadyAdmitted} onChange={() => onToggle(candidate)} />
                </td>
                <td>{shortId(candidate.runId)}</td>
                <td>#{candidate.spawnerId}</td>
                <td>L{candidate.lineageId} / gen {candidate.generation}</td>
                <td>{candidate.children}</td>
                <td>{candidate.resolvedTrades}</td>
                <td>{candidate.ageExposurePercentile.toFixed(0)}%</td>
                <td>{formatOptional(candidate.sharpe)}</td>
                <td>{formatOptional(candidate.sortino)}</td>
                <td>{formatPercent(candidate.hitRate)}</td>
                <td>{candidate.averagePayoff.toFixed(3)}</td>
                <td>{candidate.reconstructionSnapshotCount} / {candidate.latestReconstructionSnapshotTick ?? "--"}</td>
                <td>{candidate.alreadyAdmitted ? "Admitted" : "Ready"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntryDetail({ entry, summary }: { entry: SineSeedBankEntry | null; summary: SineSeedBankEntrySummary }) {
  if (!entry) {
    return (
      <div className="sine-seed-bank-entry-detail">
        <div className="sine-workbench-mini-grid">
          <Metric label="Source run" value={shortId(summary.source.runId)} />
          <Metric label="Source agent" value={`#${summary.source.spawnerId}`} />
          <Metric label="Lineage" value={`L${summary.source.lineageId} / gen ${summary.source.generation}`} />
          <Metric label="Frozen snapshots" value={String(summary.reconstructionSnapshotCount)} />
        </div>
        <div className="sine-history-empty">Loading frozen snapshot detail...</div>
      </div>
    );
  }
  const snapshotTicks = entry.snapshots.map((snapshot) => snapshot.sourceTick);
  const minTick = snapshotTicks.length ? Math.min(...snapshotTicks) : null;
  const maxTick = snapshotTicks.length ? Math.max(...snapshotTicks) : null;
  const reasons = [...new Set(entry.snapshots.map((snapshot) => snapshot.sourceReason))].join(", ");
  const metrics = entry.admission.metrics;
  return (
    <div className="sine-seed-bank-entry-detail">
      <div className="sine-workbench-mini-grid">
        <Metric label="Source run" value={shortId(entry.source.runId)} />
        <Metric label="Source agent" value={`#${entry.source.spawnerId}`} />
        <Metric label="Lineage" value={`L${entry.source.lineageId} / gen ${entry.source.generation}`} />
        <Metric label="Frozen snapshots" value={String(entry.reconstructionSnapshotCount)} />
        <Metric label="Tick range" value={minTick === null || maxTick === null ? "--" : `${minTick} - ${maxTick}`} />
        <Metric label="Created" value={formatDate(entry.createdAt)} />
      </div>
      <div className="sine-history-empty">Snapshot reasons: {reasons || "--"}</div>
      <div className="sine-history-empty">Admission-time metrics are frozen for provenance; source run history is not required for this detail view.</div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Resolved trades" value={formatMetric(metrics.resolvedTrades)} />
        <Metric label="Children" value={formatMetric(metrics.children)} />
        <Metric label="Age pct" value={formatMetric(metrics.ageExposurePercentile, "%")} />
        <Metric label="Sharpe" value={formatMetric(metrics.sharpe)} />
        <Metric label="Sortino" value={formatMetric(metrics.sortino)} />
        <Metric label="Hit rate" value={formatMetricPercent(metrics.hitRate)} />
        <Metric label="Avg payoff" value={formatMetric(metrics.averagePayoff)} />
        <Metric label="Net payoff" value={formatMetric(metrics.cumulativePayoff)} />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sine-select-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clampInteger(event.target.value, min, max))}
      />
    </label>
  );
}

function TextNumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="sine-select-field">
      <span>{label}</span>
      <input type="number" step="0.1" value={value} placeholder="Any" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

async function loadSeedBanks() {
  const response = await listSineSeedBanks();
  return response.seedBanks;
}

const SOURCE_RUN_PAGE_SIZE = 100;

async function loadCandidateRuns({ offset, search }: { offset: number; search: string }) {
  return listSineSeedBankCandidateRuns({ limit: SOURCE_RUN_PAGE_SIZE, offset, search });
}

async function loadCandidates(runIds: string[], bankId: string, filters: CandidateFilters) {
  return listSineSeedBankCandidates({
    runIds,
    bankId: bankId || undefined,
    ...publicAdmissionFilters(filters),
    limit: filters.limit,
    offset: filters.offset,
  });
}

function publicAdmissionFilters(filters: CandidateFilters): SineSeedBankCandidateFilter {
  return {
    minResolvedTrades: filters.minResolvedTrades,
    minChildren: filters.minChildren,
    minAgePercentile: filters.minAgePercentile,
    minSharpe: optionalNumber(filters.minSharpe),
    minSortino: optionalNumber(filters.minSortino),
  };
}

function optionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function candidateKey(candidate: Pick<SineSeedBankCandidate, "runId" | "spawnerId">) {
  return `${candidate.runId}:${candidate.spawnerId}`;
}

function clampInteger(value: string, min: number, max?: number) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, max === undefined ? numeric : Math.min(max, numeric));
}

function shortId(value: string) {
  return value.length <= 10 ? value : value.slice(0, 8);
}

function formatOptional(value: number | null) {
  return value === null ? "--" : value.toFixed(3);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMetric(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(Math.abs(value) >= 100 ? 0 : 3)}${suffix}`;
}

function formatMetricPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
