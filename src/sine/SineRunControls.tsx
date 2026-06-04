import { Pause, Play, RotateCcw, Square } from "lucide-react";

export function SineRunControls({
  playing,
  runState,
  onPlay,
  onPause,
  onStop,
  onReset,
}: {
  playing: boolean;
  runState: "idle" | "running" | "paused" | "stopped";
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  return (
    <section className="sine-run-controls" aria-label="Run controls">
      <button type="button" className="sine-button primary" onClick={onPlay} disabled={playing}>
        <Play size={17} />
        {runState === "paused" ? "Resume" : "Play"}
      </button>
      <button type="button" className="sine-button" onClick={onPause} disabled={runState !== "running"}>
        <Pause size={17} />
        Pause
      </button>
      <button type="button" className="sine-button" onClick={onStop} disabled={runState !== "running" && runState !== "paused"}>
        <Square size={15} />
        Stop
      </button>
      <button type="button" className="sine-button" onClick={onReset}>
        <RotateCcw size={17} />
        New Run
      </button>
    </section>
  );
}
