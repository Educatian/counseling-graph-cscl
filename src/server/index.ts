import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { db, schema } from "./db/client.js";
import { initDb, loadSeedIfEmpty } from "./db/init.js";

await initDb();
const seedResult = await loadSeedIfEmpty();
console.log("[db] seed:", seedResult);

const app = new Hono();
app.use("/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.get("/api/graph", async (c) => {
  const nodes = await db.select().from(schema.coreNodes).all();
  const edges = await db.select().from(schema.coreEdges).all();
  const paths = await db.select().from(schema.learningPaths).all();
  return c.json({
    nodes,
    edges,
    paths: paths.map((p) => ({ ...p, nodeSequence: JSON.parse(p.nodeSequenceJson) }))
  });
});

app.post("/api/events", async (c) => {
  const body = await c.req.json<{
    userId?: string; sessionId?: string; cohortId?: string;
    kind: string; payload?: unknown;
  }>();
  await db.insert(schema.eventLog).values({
    userId: body.userId ?? "anon",
    sessionId: body.sessionId ?? null,
    cohortId: body.cohortId ?? null,
    kind: body.kind,
    payload: body.payload !== undefined ? JSON.stringify(body.payload) : null,
    ts: new Date()
  }).run();
  return c.json({ ok: true });
});

app.get("/api/events/recent", async (c) => {
  const rows = await db.select().from(schema.eventLog).limit(50).all();
  return c.json({ events: rows });
});

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] http://localhost:${info.port}`);
});
