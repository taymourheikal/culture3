import { sineApiUrl } from "../sineApi";

export async function postSineSnapshot(packet: unknown) {
  const response = await fetch(sineApiUrl("/api/sine/snapshots"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(packet),
  });
  if (!response.ok) throw new Error(`Persistence failed: ${response.status}`);
}
