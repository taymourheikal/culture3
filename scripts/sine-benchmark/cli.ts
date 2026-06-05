export function parseFlagArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const body = token.slice(2);
    const equalsIndex = body.indexOf("=");
    const key = equalsIndex >= 0 ? body.slice(0, equalsIndex) : body;
    const inlineValue = equalsIndex >= 0 ? body.slice(equalsIndex + 1) : undefined;
    if (!key) throw new Error(`Unexpected argument ${token}`);
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, next);
    index += 1;
  }
  return values;
}

export function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

export function readIntegerOption(values: Map<string, string>, key: string, fallback: number, min: number) {
  return readInteger(values.get(key) ?? String(fallback), `--${key}`, min);
}

export function readIntegerListOption(values: Map<string, string>, key: string, fallback: number[], min: number) {
  return (values.get(key) ?? fallback.join(",")).split(",").map((value) => readInteger(value.trim(), `--${key}`, min));
}

export function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export function roundKb(value: number) {
  return round(value, 1);
}
