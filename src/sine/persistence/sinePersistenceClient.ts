import { postSineJson } from "../sineApi";

export async function postSineSnapshot(packet: unknown) {
  await postSineJson("/api/sine/snapshots", packet, { errorMessage: (status) => `Persistence failed: ${status}` });
}
