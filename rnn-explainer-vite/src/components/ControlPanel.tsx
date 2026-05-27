import type { Controls } from "../model/types";

const CONTROL_LABELS: Record<keyof Controls, string> = {
  inputWeight: "Input weight",
  bias: "Bias",
  memoryWeight: "Memory weight",
  startingMemory: "Starting memory",
  resetGate: "GRU reset gate",
  updateGate: "GRU update gate",
  forgetGate: "LSTM forget gate",
  writeGate: "LSTM write gate",
  outputGate: "LSTM output gate",
};

const CONTROL_RANGES: Record<keyof Controls, { min: number; max: number; step: number }> = {
  inputWeight: { min: -2, max: 2, step: 0.01 },
  bias: { min: -1, max: 1, step: 0.01 },
  memoryWeight: { min: -2, max: 2, step: 0.01 },
  startingMemory: { min: -1, max: 1, step: 0.01 },
  resetGate: { min: 0, max: 1, step: 0.01 },
  updateGate: { min: 0, max: 1, step: 0.01 },
  forgetGate: { min: 0, max: 1, step: 0.01 },
  writeGate: { min: 0, max: 1, step: 0.01 },
  outputGate: { min: 0, max: 1, step: 0.01 },
};

export function ControlPanel({
  controls,
  visibleControls,
  playing,
  tryText,
  onControl,
  onPreset,
  onStep,
  onPlay,
  onReset,
}: {
  controls: Controls;
  visibleControls: Array<keyof Controls>;
  playing: boolean;
  tryText: string;
  onControl: (key: keyof Controls, value: number) => void;
  onPreset: (name: "remember" | "forget" | "ignore") => void;
  onStep: () => void;
  onPlay: () => void;
  onReset: () => void;
}) {
  return (
    <aside className="panel controls">
      <div className="section-title">Playback</div>
      <div className="transport">
        <button type="button" className="primary" onClick={onStep}>
          Step
        </button>
        <button type="button" onClick={onPlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="section-title">Controls</div>
      <div className="control-list">
        {visibleControls.map((key) => {
          const range = CONTROL_RANGES[key];
          return (
            <label key={key} className="control-row">
              <span>
                {CONTROL_LABELS[key]}
                <strong>{controls[key].toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={controls[key]}
                onChange={(event) => onControl(key, Number(event.target.value))}
              />
            </label>
          );
        })}
      </div>

      <div className="try-card">
        <strong>Try this</strong>
        <p>{tryText}</p>
      </div>

      <div className="preset-row" aria-label="Useful preset controls">
        <button type="button" onClick={() => onPreset("remember")}>
          Remember
        </button>
        <button type="button" onClick={() => onPreset("forget")}>
          Forget
        </button>
        <button type="button" onClick={() => onPreset("ignore")}>
          Ignore Memory
        </button>
      </div>
    </aside>
  );
}
