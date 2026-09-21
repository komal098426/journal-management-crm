import { createApp } from "./app.js";
import { env } from "./config/env.js";

const server = createApp().listen(env.PORT, () => {
  console.log(`Northstar ERP API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, closing server`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
