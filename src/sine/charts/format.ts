export function formatSlope(value: number) {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${Math.abs(value).toFixed(2)}%/s`;
}

export function formatPercentAxis(value: number) {
  if (Math.abs(value) < 0.005) return "0.00%";
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${Math.abs(value).toFixed(2)}%`;
}

export function formatSignedPercent(value: number) {
  return formatPercentAxis(value);
}

export function roundForInput(value: number, step: number) {
  const decimals = step.toString().split(".")[1]?.length ?? 0;
  return Number(value.toFixed(decimals));
}
