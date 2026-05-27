import { Search } from "lucide-react";

export function HistoricalRnnLookup({
  spawnerId,
  tick,
  setSpawnerId,
  setTick,
  onInspect,
}: {
  spawnerId: string;
  tick: string;
  setSpawnerId: (value: string) => void;
  setTick: (value: string) => void;
  onInspect: () => void;
}) {
  return (
    <div className="sine-history-rnn-fields">
      <label>
        Spawner ID
        <input type="number" min={1} step={1} value={spawnerId} placeholder="471" onChange={(event) => setSpawnerId(event.target.value)} />
      </label>
      <label>
        Tick
        <input type="number" min={0} step={1} value={tick} placeholder="latest" onChange={(event) => setTick(event.target.value)} />
      </label>
      <button type="button" onClick={onInspect}>
        <Search size={15} />
        Inspect RNN
      </button>
    </div>
  );
}
