import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { db, schema } from "./db/client.js";
import { loadSeedIfEmpty } from "./db/init.js";
import { optionalAuth } from "./lib/auth.js";

const seedResult = await loadSeedIfEmpty();
console.log("[db] seed:", seedResult);

const app = new Hono();
app.use("/*", cors());
app.use("/api/*", optionalAuth);

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.get("/api/me", (c) => c.json({ user: c.var.user }));

app.get("/api/graph", async (c) => {
  const [nodes, edges, paths] = await Promise.all([
    db.select().from(schema.coreNodes),
    db.select().from(schema.coreEdges),
    db.select().from(schema.learningPaths)
  ]);
  return c.json({
    nodes,
    edges,
    paths: paths.map((p) => ({ ...p, nodeSequence: p.nodeSequenceJson as string[] }))
  });
});

app.post("/api/events", async (c) => {
  const body = await c.req.json<{
    sessionId?: string;
    kind: string;
    payload?: unknown;
  }>();
  const u = c.var.user;
  await db.insert(schema.eventLog).values({
    userId: u.id,
    sessionId: body.sessionId ?? null,
    cohortId: u.cohortId,
    kind: body.kind,
    payload: body.payload !== undefined ? (body.payload as object) : null
  });
  return c.json({ ok: true });
});

app.get("/api/events/recent", async (c) => {
  const rows = await db.select().from(schema.eventLog).limit(50);
  return c.json({ events: rows });
});

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] http://localhost:${info.port}`);
});
