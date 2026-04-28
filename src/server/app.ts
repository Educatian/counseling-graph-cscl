/**
 * Runtime-agnostic Hono app factory.
 *
 * Used from two entrypoints:
 *   - src/server/index.ts        — Node (dev)        via @hono/node-server
 *   - functions/api/[[catchall]] — Cloudflare Pages  via hono/cloudflare-pages
 *
 * Env-var bridging: on Workers/Pages Functions env vars come in via c.env, not
 * process.env. The first middleware copies relevant keys into process.env so
 * existing reads in db/client.ts and lib/auth.ts keep working without
 * threading c.env through every helper.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDb, schema } from "./db/client.js";
import { optionalAuth } from "./lib/auth.js";

const ENV_KEYS_TO_BRIDGE = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

export function createApp() {
  const app = new Hono();

  // Bridge Workers env → process.env once per request (idempotent).
  app.use("*", async (c, next) => {
    if (c.env && typeof c.env === "object") {
      for (const k of ENV_KEYS_TO_BRIDGE) {
        const v = (c.env as Record<string, unknown>)[k];
        if (typeof v === "string" && !process.env[k]) {
          process.env[k] = v;
        }
      }
    }
    return next();
  });

  app.use("/*", cors());
  app.use("/api/*", optionalAuth);

  app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

  app.get("/api/me", (c) => c.json({ user: c.var.user }));

  app.get("/api/graph", async (c) => {
    const { db } = getDb();
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
    const { db } = getDb();
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
    const { db } = getDb();
    const rows = await db.select().from(schema.eventLog).limit(50);
    return c.json({ events: rows });
  });

  return app;
}
