import { createServer } from "node:http";
import { markInterruptedBatchesFailed } from "./db.mjs";
import { routeRequest } from "./routes.mjs";

markInterruptedBatchesFailed();

const server = createServer(routeRequest);

server.listen(8787, "127.0.0.1", () => {
  console.log("SQLite persistence API listening on http://127.0.0.1:8787");
});
