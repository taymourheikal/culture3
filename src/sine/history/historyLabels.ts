import type { SineSessionSummary } from "./sineHistoryTypes";

export function sessionSourceLabel(settings: Record<string, unknown> | undefined) {
  const source = typeof settings?.source === "string" ? settings.source : "generated";
  if (source === "btcusd_1m") return "BTCUSD 1m";
  if (source === "btcusd_5m") return "BTCUSD 5m";
  return "Generated";
}

export function sourceLabelFromSession(session: Pick<SineSessionSummary, "marketSource" | "settings">) {
  if (session.marketSource === "btcusd_1m" || session.marketSource === "btcusd_5m" || session.marketSource === "generated") {
    return sessionSourceLabel({ source: session.marketSource });
  }
  return sessionSourceLabel(session.settings);
}

export function sessionStartLabel(settings: Record<string, unknown> | undefined) {
  const playback = settings?.playback;
  if (!playback || typeof playback !== "object") return "-";
  const start = (playback as Record<string, unknown>).startDateTime;
  return typeof start === "string" && start ? start : "-";
}
