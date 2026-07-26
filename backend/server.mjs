import { checkNyPassengerPlate } from "./dmv-request.mjs";
import { createDmvHttpServer } from "./http.mjs";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "127.0.0.1";
const server = createDmvHttpServer(checkNyPassengerPlate);

server.listen(port, host, () => {
  console.log(JSON.stringify({ message: "DMV backend ready", host, port }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ message: "DMV backend stopping", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
