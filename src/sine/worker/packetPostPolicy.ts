import type { MarketRunState } from "../marketWorkerProtocol";

export type UiPacketKey = "chart" | "roster" | "stats";

export type UiPacketSignature = {
  key: UiPacketKey;
  value: string;
};

export function createPacketPostPolicy() {
  const lastPostedSignature = new Map<UiPacketKey, string>();

  return {
    reset() {
      lastPostedSignature.clear();
    },

    shouldPost({
      key,
      force,
      runState,
      signature,
      cadenceDue,
    }: {
      key: UiPacketKey;
      force: boolean;
      runState: MarketRunState;
      signature: string;
      cadenceDue: () => boolean;
    }) {
      if (force) return true;
      if (runState === "running") return cadenceDue();
      return lastPostedSignature.get(key) !== signature;
    },

    recordPost({ key, value }: UiPacketSignature) {
      lastPostedSignature.set(key, value);
    },
  };
}
