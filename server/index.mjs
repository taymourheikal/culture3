import { createServer } from "node:http";
import { markInterruptedBatchesFailed } from "./antDb.mjs";
import { routeRequest } from "./routes.mjs";
import { markInterruptedSineHeadlessRunsFailed } from "./sineHeadlessRepository.mjs";

markInterruptedBatchesFailed();
markInterruptedSineHeadlessRunsFailed();

const server = createServer(routeRequest);
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

server.listen(port, host, () => {
  console.log(`SQLite persistence API listening on http://${host}:${port}`);
});
