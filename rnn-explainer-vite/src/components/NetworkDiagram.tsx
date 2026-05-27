import { GateValve } from "./GateValve";
import { SignalParticle } from "./SignalParticle";
import type { ModelKind, TickResult } from "../model/types";

const INPUT = "M 96 250 C 190 250, 240 250, 326 250";
const MEMORY = "M 248 390 C 340 458, 520 438, 566 332";
const OUTPUT = "M 660 250 C 742 250, 798 250, 884 250";
const CELL = "M 560 350 C 632 350, 694 326, 746 292";
const GATE_A = "M 292 128 C 390 132, 456 170, 516 218";
const GATE_B = "M 472 108 C 530 138, 576 172, 604 218";

export function NetworkDiagram({
  model,
  result,
  tick,
  onExplain,
}: {
  model: ModelKind;
  result: TickResult | null;
  tick: number;
  onExplain: (message: string) => void;
}) {
  const paths = result?.activePaths ?? { input: 0.7, memory: 0, candidate: 0, gateA: 0, gateB: 0, cell: 0, output: 0 };
  const showMemory = model !== "nn";
  const showGates = model === "gru" || model === "lstm" || model === "sine-gru";
  const showCell = model === "lstm";
  const showSparse = model === "sine-gru";
  const gateA = result?.resetGate ?? result?.forgetGate ?? 0;
  const gateB = result?.updateGate ?? result?.writeGate ?? 0;

  return (
    <div className="diagram-card">
      <div className="legend">
        <span><i className="blue" /> input now</span>
        <span><i className="green" /> previous memory</span>
        <span><i className="amber" /> gate valve</span>
        <span><i className="violet" /> output now</span>
        <span><i className="red" /> LSTM cell</span>
      </div>
      <svg viewBox="0 0 980 520" role="img" aria-label="Animated neural memory diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f332a" />
          </marker>
        </defs>

        <Path d={INPUT} kind="input" value={paths.input} onExplain={() => onExplain("Blue arrows carry the current input for this tick.")} />
        {showMemory ? (
          <Path
            d={MEMORY}
            kind="memory dashed"
            value={paths.memory}
            onExplain={() => onExplain("Dashed green arrows carry previous memory from the last tick into this tick.")}
          />
        ) : null}
        {showGates ? <Path d={GATE_A} kind="gate" value={paths.gateA} onExplain={() => onExplain("Amber arrows feed gate controls. A gate is like a valve.")} /> : null}
        {showGates ? <Path d={GATE_B} kind="gate" value={paths.gateB} onExplain={() => onExplain("The wider the gate value, the more signal the valve lets through.")} /> : null}
        {showCell ? <Path d={CELL} kind="cell" value={paths.cell} onExplain={() => onExplain("Red shows the LSTM cell state, its private long-term notebook.")} /> : null}
        <Path d={OUTPUT} kind="output" value={paths.output} onExplain={() => onExplain("Purple arrows carry the model's output for this tick.")} />

        <Node x={70} y={250} r={48} title="Input" sub={result ? result.input.toFixed(2) : "next x"} onExplain={() => onExplain("Input is the number the model sees right now.")} />
        {showSparse ? (
          <>
            <Node x={344} y={190} w={128} h={74} title="Update" sub="gate target" onExplain={() => onExplain("A sparse Sine connection can target a specific gate, such as update.")} />
            <Node x={344} y={286} w={128} h={74} title="Reset" sub="gate target" onExplain={() => onExplain("A reset gate controls how previous memory shapes the candidate.")} />
            <Node x={520} y={238} w={150} h={96} title="Candidate" sub="new idea" onExplain={() => onExplain("Candidate is the new memory proposal before it is blended with old memory.")} />
          </>
        ) : (
          <Node
            x={342}
            y={204}
            w={292}
            h={112}
            title={model === "nn" ? "Hidden Layer" : model === "lstm" ? "Hidden Output" : "Hidden Memory"}
            sub={model === "nn" ? "current only" : "h for this tick"}
            onExplain={() => onExplain("Hidden units are internal calculations between input and output. In memory models, hidden state can be carried forward.")}
          />
        )}

        {showMemory ? (
          <Node x={178} y={358} w={150} h={70} title="Previous h" sub={result ? result.previousMemory.toFixed(2) : "last tick"} onExplain={() => onExplain("Previous h is the memory value from the last tick.")} />
        ) : null}

        {showGates ? (
          <>
            <GateValve x={266} y={80} label={model === "lstm" ? "Forget" : "Reset"} value={gateA} onExplain={() => onExplain(model === "lstm" ? "Forget decides how much old cell memory survives." : "Reset decides how much previous memory helps form the candidate.")} />
            <GateValve x={454} y={62} label={model === "lstm" ? "Write" : "Update"} value={gateB} onExplain={() => onExplain(model === "lstm" ? "Write decides how much new candidate content enters the cell." : "Update decides how much old memory is kept versus replaced.")} />
          </>
        ) : null}

        {showCell ? (
          <>
            <GateValve x={632} y={80} label="Output" value={result?.outputGate ?? 0} onExplain={() => onExplain("Output gate decides how much of the LSTM cell is visible as hidden output.")} />
            <Node x={690} y={330} w={180} h={72} title="Cell State" sub={result ? result.cell.toFixed(2) : "notebook"} onExplain={() => onExplain("The LSTM cell is a separate long-term memory track.")} />
          </>
        ) : null}

        <Node x={918} y={250} r={48} title="Output" sub={result ? result.output.toFixed(2) : "next y"} onExplain={() => onExplain("Output is what the model emits after this tick's calculation.")} />

        {tick > 0 ? (
          <>
            <SignalParticle replayKey={`input-${tick}`} path={INPUT} color="#1f6feb" />
            {showMemory ? <SignalParticle replayKey={`memory-${tick}`} path={MEMORY} color="#177245" /> : null}
            {showGates ? <SignalParticle replayKey={`gateA-${tick}`} path={GATE_A} color="#b56a00" /> : null}
            {showCell ? <SignalParticle replayKey={`cell-${tick}`} path={CELL} color="#b73535" /> : null}
            <SignalParticle replayKey={`output-${tick}`} path={OUTPUT} color="#6f42c1" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function Path({ d, kind, value, onExplain }: { d: string; kind: string; value: number; onExplain: () => void }) {
  return (
    <path
      className={`signal-path ${kind} clickable`}
      d={d}
      markerEnd="url(#arrow)"
      style={{ strokeWidth: 1.6 + Math.abs(value) * 7, opacity: 0.2 + Math.min(0.8, Math.abs(value)) }}
      onClick={onExplain}
      tabIndex={0}
      role="button"
    />
  );
}

function Node({
  x,
  y,
  title,
  sub,
  r,
  w,
  h,
  onExplain,
}: {
  x: number;
  y: number;
  title: string;
  sub: string;
  r?: number;
  w?: number;
  h?: number;
  onExplain: () => void;
}) {
  if (r) {
    return (
      <g className="node clickable" onClick={onExplain} tabIndex={0} role="button">
        <circle cx={x} cy={y} r={r} />
        <text x={x} y={y - 8}>
          {title}
        </text>
        <text className="sub" x={x} y={y + 14}>
          {sub}
        </text>
      </g>
    );
  }
  const width = w ?? 140;
  const height = h ?? 74;
  return (
    <g className="node clickable" onClick={onExplain} tabIndex={0} role="button">
      <rect x={x} y={y} width={width} height={height} rx="11" />
      <text x={x + width / 2} y={y + height / 2 - 8}>
        {title}
      </text>
      <text className="sub" x={x + width / 2} y={y + height / 2 + 15}>
        {sub}
      </text>
    </g>
  );
}
