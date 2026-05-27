export function GateValve({
  x,
  y,
  label,
  value,
  onExplain,
}: {
  x: number;
  y: number;
  label: string;
  value: number;
  onExplain: () => void;
}) {
  const opening = 10 + value * 54;
  return (
    <g className="gate-valve clickable" onClick={onExplain} tabIndex={0} role="button" aria-label={`${label} gate`}>
      <rect x={x} y={y} width="120" height="74" rx="10" />
      <text x={x + 60} y={y + 22}>
        {label}
      </text>
      <text className="sub" x={x + 60} y={y + 42}>
        {value.toFixed(2)}
      </text>
      <rect className="valve-track" x={x + 27} y={y + 54} width="66" height="8" rx="4" />
      <rect className="valve-open" x={x + 27} y={y + 54} width={opening} height="8" rx="4" />
    </g>
  );
}
