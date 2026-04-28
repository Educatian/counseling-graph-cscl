import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadSeedIfEmpty } from "./db/init.js";

const seedResult = await loadSeedIfEmpty();
console.log("[db] seed:", seedResult);

const app = createApp();

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] http://localhost:${info.port}`);
});
