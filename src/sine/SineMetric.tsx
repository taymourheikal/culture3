export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sine-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
