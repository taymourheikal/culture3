import { useMemo, useState } from "react";
import { formatSignedPercent } from "./charts/format";
import type { ChartFoodMarker } from "./marketWorkerProtocol";
import { SineWorkbenchModal } from "./SineWorkbenchModal";

type LedgerStatusFilter = "all" | ChartFoodMarker["status"];
type LedgerDirectionFilter = "all" | ChartFoodMarker["direction"];
type LedgerSortKey = "spawnTick" | "resolveTick" | "creatorSpawnerId" | "payoff" | "status";

export function VisibleTradeLedgerModal({
  foods,
  onSelectCreator,
  onClose,
}: {
  foods: ChartFoodMarker[];
  onSelectCreator: (spawnerId: number) => void;
  onClose: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<LedgerStatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<LedgerDirectionFilter>("all");
  const [sortKey, setSortKey] = useState<LedgerSortKey>("spawnTick");
  const rows = useMemo(
    () =>
      foods
        .filter((food) => statusFilter === "all" || food.status === statusFilter)
        .filter((food) => directionFilter === "all" || food.direction === directionFilter)
        .map((food, index) => ({ food, index }))
        .sort((left, right) => compareLedgerRows(left.food, right.food, sortKey) || left.index - right.index)
        .map(({ food }) => food),
    [directionFilter, foods, sortKey, statusFilter],
  );

  return (
    <SineWorkbenchModal title="Visible Trade Ledger" eyebrow="Chart Window" onClose={onClose}>
      <div className="sine-modal-toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LedgerStatusFilter)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
          </select>
        </label>
        <label>
          Direction
          <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as LedgerDirectionFilter)}>
            <option value="all">All</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as LedgerSortKey)}>
            <option value="spawnTick">Spawn tick</option>
            <option value="resolveTick">Resolve tick</option>
            <option value="creatorSpawnerId">Creator</option>
            <option value="payoff">Payoff</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
      <div className="sine-ledger-scope">Visible chart-window trades only. Historical ledger rows are not included here.</div>
      <div className="sine-ledger-table" role="table" aria-label="Visible trade ledger">
        <div className="sine-ledger-row head" role="row">
          <span>Food</span>
          <span>Creator</span>
          <span>Side</span>
          <span>Ticks</span>
          <span>Signal</span>
          <span>Payoff</span>
          <span>Status</span>
        </div>
        {rows.map((food) => (
          <button type="button" key={food.id} className="sine-ledger-row" role="row" onClick={() => onSelectCreator(food.creatorSpawnerId)}>
            <span>#{food.id}</span>
            <span>
              #{food.creatorSpawnerId} / L{food.creatorLineageId}
            </span>
            <span>{food.direction} x{food.strength.toFixed(2)}</span>
            <span>
              {food.spawnTick} - {food.resolveTick} ({food.horizonTicks})
            </span>
            <span>
              {formatSignedPercent(food.entrySignal)} / {food.exitSignal === undefined ? "--" : formatSignedPercent(food.exitSignal)}
            </span>
            <span>{food.payoff === undefined ? "--" : formatSignedPercent(food.payoff)}</span>
            <span className={`sine-ledger-status ${food.status}`}>{food.status}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="sine-ledger-empty">No visible trades match these filters.</div> : null}
      </div>
    </SineWorkbenchModal>
  );
}

function compareLedgerRows(left: ChartFoodMarker, right: ChartFoodMarker, sortKey: LedgerSortKey) {
  if (sortKey === "status") return left.status.localeCompare(right.status);
  const leftValue = ledgerValue(left, sortKey);
  const rightValue = ledgerValue(right, sortKey);
  return rightValue - leftValue;
}

function ledgerValue(food: ChartFoodMarker, sortKey: Exclude<LedgerSortKey, "status">) {
  if (sortKey === "payoff") return food.payoff ?? Number.NEGATIVE_INFINITY;
  return food[sortKey];
}
