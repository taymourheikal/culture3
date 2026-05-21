export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="architecture-metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
