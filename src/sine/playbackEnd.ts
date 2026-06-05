import type { MarketPlaybackSettings } from "./marketRuntimeConfig";
import { parseDateTimeToUnixSeconds } from "./sourceTime";

export type PlaybackEndCheckInput = {
  playback: MarketPlaybackSettings;
  currentTick: number;
  runStartTick: number;
  currentSourceTimestamp?: number | null;
};

export function playbackEndReached({
  playback,
  currentTick,
  runStartTick,
  currentSourceTimestamp,
}: PlaybackEndCheckInput) {
  if (playback.endMode === "ticks") {
    return Math.max(0, currentTick - runStartTick) >= playback.endAfterTicks;
  }
  if (playback.endMode === "date") {
    const endTimestamp = parseDateTimeToUnixSeconds(playback.endDateTime);
    if (endTimestamp === null || currentSourceTimestamp === null || currentSourceTimestamp === undefined) return false;
    return currentSourceTimestamp >= endTimestamp;
  }
  return false;
}
