/**
 * Cloudflare Pages Function — entrypoint for /api/* routes.
 *
 * The directory layout `functions/api/[[catchall]].ts` tells Cloudflare Pages
 * to invoke this Function for every path matching /api/*. The Hono app
 * itself lives in `src/server/app.ts` and is shared with the Node dev server
 * (`src/server/index.ts`), so behavior is identical in both runtimes.
 *
 * Required Pages settings:
 *   - Compatibility flags: nodejs_compat (so postgres-js can use TCP sockets)
 *   - Compatibility date:  2024-09-23 or later (when nodejs_compat became GA)
 *   - Env vars (Production + Preview):
 *       DATABASE_URL                — Supabase TRANSACTION pooler (port 6543)
 *       SUPABASE_URL
 *       SUPABASE_PUBLISHABLE_KEY
 *       SUPABASE_SECRET_KEY
 *       (optional) SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY for legacy back-compat
 */
import { handle } from "hono/cloudflare-pages";
import { createApp } from "../../src/server/app";

const app = createApp();
export const onRequest = handle(app);
