# Setup tutorial — Supabase + Cloudflare Pages

Tutorial-grade record of how `counseling-graph-cscl` was migrated from a local
libSQL Phase-0 scaffold to a Supabase Postgres + Cloudflare Pages deployment.
Captures every command, every failed syntax, and every gotcha so the next
project (or the next person setting this one up) skips the same potholes.

> **TL;DR for the impatient.** Pick **Route S** (Supabase + Cloudflare Pages):
> Postgres SQL is a hard requirement for the analytics layer (lag-sequential,
> HMM, graph-edit-distance), and Supabase RLS expresses the IRB-required
> "student A ≠ student B" boundary as policies instead of hand-rolled checks.
> This doc walks the full migration end-to-end.

---

## 0. What we started with

```
src/server/db/client.ts     // @libsql/client (file:./data/app.db)
src/server/db/schema.ts     // drizzle-orm/sqlite-core
src/server/db/init.ts       // raw DDL CREATE TABLE IF NOT EXISTS, executeMultiple
drizzle.config.ts           // dialect: "sqlite"
```

Phase 0 deploys as a static GH-Pages preview by dumping `public/graph.json`
(no server). Local dev runs both web (5173) and api (8787) via
`concurrently`. The README claimed `lib/auth.ts · lib/realtime.ts ·
lib/storage.ts` adapter seams existed — they didn't. README was aspirational.

---

## 1. User-side: create the Supabase project

Two paths. We took **Path A** (API).

### Path A — Personal Access Token + Management API

```
https://supabase.com/dashboard/account/tokens
  → Generate new token → name: counseling-graph-cscl-claude
  → copy `sbp_…`
```

Then via API:

```bash
# List orgs, pick the one consistent with your other projects.
curl -s -H "Authorization: Bearer sbp_…" \
  https://api.supabase.com/v1/organizations

# We picked DataSandbox (id: kxrejgpuocgodydpaldf) because the other
# ADDIE Lab projects (ReviewLens, codedefense, speakwise, designtensionstudio)
# all live there.

# Create the project. db_pass should be 32 chars URI-safe alnum (no +/=).
PASS=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+/=]/g,'').slice(0,32))")
curl -s -X POST https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer sbp_…" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"counseling-graph-cscl\",
    \"organization_id\": \"kxrejgpuocgodydpaldf\",
    \"db_pass\": \"$PASS\",
    \"region\": \"ap-northeast-2\",
    \"plan\": \"free\"
  }"
```

Region `ap-northeast-2` (Seoul) — picked for Korean users / Korean
discourse data, even though the rest of the org is on US regions. Latency
matters more than uniformity here.

Wait ~1–2 min for `status: ACTIVE_HEALTHY` (poll
`GET /v1/projects/{ref}`). Then fetch keys:

```bash
curl -s -H "Authorization: Bearer sbp_…" \
  "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true"
```

Modern Supabase returns **four** keys per project:

| name | type | use |
|---|---|---|
| `anon` | legacy JWT | back-compat |
| `service_role` | legacy JWT | back-compat (admin) |
| `default` | publishable | browser-safe (replaces anon) |
| `default` | secret | server-only (replaces service_role) |

We use the modern `sb_publishable_*` and `sb_secret_*` going forward; the
legacy JWTs stay in `.env.local` for any client lib that still expects them.

### Path B — dashboard click-through

If you don't want to deal with the PAT: dashboard → New project, fill the
form, copy the four keys + connection strings from the dashboard. Same
end state, just clickier.

### After PAT is no longer needed

> ⚠️ **Revoke the PAT** immediately after setup at the same URL. PAT
> holders can create/delete *any* of your Supabase projects.

---

## 2. **Gotcha that cost an hour: the pooler hostname**

The dashboard "Connection string" panel and the Management API
`/config/database/pgbouncer` endpoint both return:

```
postgresql://postgres:[YOUR-PASSWORD]@db.{ref}.supabase.co:6543/postgres
```

This is the **dedicated** pgbouncer for the project. **It does not
resolve via DNS on free tier** — Supabase deprecated direct IPv4 access
to the project hostname in late 2024/2025. You'll see:

```
Error: getaddrinfo ENOTFOUND db.{ref}.supabase.co
```

You must use the **shared pooler**, but the docs and dashboard at the
time of writing point you at `aws-0-{region}.pooler.supabase.com`, which
returns:

```
PostgresError: (ENOTFOUND) tenant/user postgres.{ref} not found
```

The hostname pattern is `aws-1-{region}` for new projects. Get the
authoritative URL via the API:

```bash
curl -s -H "Authorization: Bearer sbp_…" \
  "https://api.supabase.com/v1/projects/{ref}/config/database/pooler"
```

Returns:

```json
{
  "db_host": "aws-1-ap-northeast-2.pooler.supabase.com",
  "db_port": 6543,
  "db_user": "postgres.{ref}",
  "pool_mode": "transaction"
}
```

Two pooler URLs you'll actually use:

| port | mode | use |
|---|---|---|
| 5432 | session | migrations (drizzle-kit), prepared statements |
| 6543 | transaction | runtime queries from serverless / Cloudflare Pages Functions |

---

## 3. `.env.local` template

```ini
# -------- Public --------
SUPABASE_URL=https://{ref}.supabase.co
SUPABASE_ANON_KEY={legacy anon JWT}
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…

# Vite-exposed (must be VITE_ prefixed to leak into client bundle)
VITE_SUPABASE_URL=https://{ref}.supabase.co
VITE_SUPABASE_ANON_KEY={legacy anon JWT}
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…

# -------- Secret (server-only) --------
SUPABASE_SERVICE_ROLE_KEY={legacy service_role JWT}
SUPABASE_SECRET_KEY=sb_secret_…

# -------- Postgres --------
# Session pooler — for migrations and prepared statements.
DATABASE_URL=postgresql://postgres.{ref}:{PASS}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres

# Transaction pooler — preferred for serverless / Cloudflare Pages Functions runtime.
DATABASE_POOLER_URL=postgresql://postgres.{ref}:{PASS}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Already gitignored. Never commit.

---

## 4. **Vite gotcha: `envDir` when `root` is set**

Vite is configured with `root: "src/client"`. Vite's `envDir` defaults to
`root`, so `.env.local` at the project root is **not loaded** unless you
explicitly point `envDir` back. Symptom: client thinks Supabase is
unconfigured (`authConfigured === false`), login UI is hidden, the
landing page shows only "Enter graph". Fix in `vite.config.ts`:

```ts
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: "src/client",
  envDir: __dirname,  // <— project root
  // …
}));
```

Verify Vite is injecting:

```bash
curl -s "http://localhost:5173/lib/supabase.ts" | head -2
# import.meta.env = {…, "VITE_SUPABASE_URL": "https://…supabase.co"}
```

---

## 5. Schema port — drizzle-orm/sqlite-core → pg-core

Mechanical conversion. Mapping:

| sqlite-core | pg-core |
|---|---|
| `sqliteTable` | `pgTable` |
| `text("col", { enum: [...] })` | `pgEnum("name", [...])` then `myEnum("col")` |
| `integer("ts", { mode: "timestamp_ms" })` | `timestamp("ts", { withTimezone: true })` |
| `integer("flag", { mode: "boolean" })` | `boolean("flag")` |
| `integer("id").primaryKey({ autoIncrement: true })` | `serial("id").primaryKey()` |
| `real("v")` | `doublePrecision("v")` |
| `text("payload_json")` (storing JSON strings) | `jsonb("payload_json")` |

Also drop `.run()` and `.all()` calls — drizzle-pg returns Promises
that resolve to arrays directly.

---

## 6. Drizzle config — load `.env.local` so `drizzle-kit` sees `DATABASE_URL`

`drizzle-kit` reads `drizzle.config.ts` standalone — it does **not**
auto-load `.env.local`. We force the load in the config itself:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
// ...
```

Alternative: prefix every drizzle-kit invocation with `dotenv -e .env.local --`
or pass `--env-file=.env.local` to tsx for migrate scripts. We did both:
`drizzle.config.ts` loads dotenv directly, and `package.json` scripts
that run tsx use Node's native flag:

```json
"db:migrate": "tsx --env-file=.env.local src/server/db/migrate.ts"
```

---

## 7. Generate and apply the schema migration

```bash
npm install postgres @supabase/supabase-js @supabase/ssr
npm install --save-dev dotenv
npm uninstall @libsql/client

npm run db:generate           # → src/server/db/migrations/0000_*.sql
npm run db:migrate            # apply against DATABASE_URL (session pooler)
```

Verify:

```bash
npx tsx --env-file=.env.local scripts/verify-schema.ts
# Tables: alignment_scores, cohorts, core_edges, core_nodes,
#         core_snapshots, discourse_networks, event_log,
#         learning_paths, users
# Enums:  …, core_domain, core_level, core_relation,
#         discourse_scope, learning_path_kind, mirror_mode,
#         user_role
```

The first server boot triggers `loadSeedIfEmpty()` from
`src/server/db/init.ts`, which loads `core-graph.seed.json` →
214 nodes, 204 edges, 8 paths.

---

## 8. Auth: closed-cohort, no public signup

Configured via Management API:

```bash
curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/{ref}/config/auth" \
  -H "Authorization: Bearer sbp_…" \
  -H "Content-Type: application/json" \
  -d '{
    "disable_signup": true,
    "mailer_autoconfirm": true,
    "external_email_enabled": true,
    "external_anonymous_users_enabled": false
  }'
```

| key | value | why |
|---|---|---|
| `disable_signup` | true | only admin-issued accounts; closed cohort |
| `mailer_autoconfirm` | true | admin-created users skip email confirm |
| `external_email_enabled` | true | email/password login still works |
| `external_anonymous_users_enabled` | false | no anonymous Supabase users |

### Creating the first admin user

Public signup is disabled, so user creation goes through the Auth
admin endpoint with the `service_role` JWT:

```bash
TEMP_PW=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64').replace(/[+/=]/g,'').slice(0,16))")
curl -s -X POST "https://{ref}.supabase.co/auth/v1/admin/users" \
  -H "Authorization: Bearer {service_role JWT}" \
  -H "apikey: {service_role JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"jewoong.moon@gmail.com\",
    \"password\": \"$TEMP_PW\",
    \"email_confirm\": true,
    \"user_metadata\": { \"role\": \"instructor\", \"display_name\": \"Jewoong Moon (admin)\" }
  }"
```

`user_metadata.role` is the **server's source of truth** for role-gated
behavior — see `src/server/lib/auth.ts`. Set `cohort_id` here too when
creating student accounts:

```json
"user_metadata": { "role": "student", "cohort_id": "spring2026_iwsdk" }
```

The Hono middleware reads `user_metadata.role` and `user_metadata.cohort_id`
out of the verified JWT and stamps them onto every `event_log` insert.

### Future: bulk user creation

For class rosters, write a `scripts/create-cohort-users.ts` that takes a
CSV (email · cohort_id · role) and walks the admin endpoint per row. Not
done yet.

---

## 9. Server-side auth middleware

`src/server/lib/auth.ts` exports `optionalAuth` (default) and `requireAuth`
(strict 401). Reads `Authorization: Bearer <jwt>`, verifies via
`supabase.auth.getUser(token)` (uses anon key + token, no DB call), then
stamps `c.var.user = { id, email, role, cohortId }`.

`/api/events` ignores `body.userId` entirely — server-derived only.
`cohortId` flows from JWT user_metadata → middleware → row insert. The
analytics agent flagged that the original `cohort_id` field was accepted
in the body but never sent; this fix closes the loop.

---

## 10. RLS — defense-in-depth even though server uses master conn

Migration `0001_rls_policies.sql` enables RLS on all 9 public tables and
creates 18 policies. Helper:

```sql
CREATE OR REPLACE FUNCTION public.is_instructor() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('instructor','researcher'),
    false
  );
$$;
```

Policies summary (the full SQL is in the migration):

| table | read | write |
|---|---|---|
| core_nodes / core_edges / core_snapshots | anon + auth | instructor only |
| cohorts | authenticated | instructor only |
| users | self + instructor | self upsert/update + instructor all |
| learning_paths | shared OR self OR instructor | author OR instructor |
| event_log | self OR instructor | self insert only (append-only) |
| alignment_scores | self OR instructor | service_role only (server batch) |
| discourse_networks | instructor only | service_role only |

**Why this still matters even though our server uses master DB
credentials and bypasses RLS:** the moment we let the browser hit
Supabase Postgres directly (Phase C — notes, threads, cases via
`@supabase/supabase-js`), RLS goes from documentation to load-bearing
without any code changes.

Verify after migration:

```bash
npx tsx --env-file=.env.local scripts/verify-rls.ts
# all 9 tables: rowsecurity = ON
# 18 policies enumerated
```

---

## 11. Client login flow

`src/client/lib/supabase.ts` initializes a singleton browser client.
Returns `null` in static (GH-Pages) mode or when env is missing — the
app gracefully falls back to no-auth demo behavior.

`src/client/lib/useAuth.ts` is the React hook: `getSession()` once,
`onAuthStateChange()` for live updates, `signIn(email, password)` and
`signOut()` callbacks.

`src/client/components/Landing.tsx` shows the login form when
`authRequired && !user`. Login → `App.tsx` `useEffect` watches
`auth.user`, auto-sets `entered = true` → graph loads. No second click.

`src/client/components/TitleBar.tsx` shows a small `로그아웃 / Sign out`
button if `userEmail` is provided.

`eventLogger.ts` attaches `Authorization: Bearer <session.access_token>`
to every `POST /api/events` so the server can resolve the user.

---

## 12. Cloudflare Pages connection (still TODO at time of writing)

Plan when ready:

1. **dash.cloudflare.com** → Workers & Pages → Create → Pages →
   Connect to Git → pick `Educatian/counseling-graph-cscl`.
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output: `dist`
   - Node version: `20` (set via `NODE_VERSION=20` env or `.nvmrc`)
3. Environment variables (Production):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `DATABASE_URL` ← use the **transaction pooler (port 6543)** here, not the session pooler
   - `API_PORT` not needed (Cloudflare assigns the port for Functions)
4. Keep the GitHub Pages workflow alive in parallel — `build:ghpages`
   produces a `__STATIC_MODE__=true` bundle that ships
   `public/graph.json` and falls back to localStorage event logging.
   Static demo stays public; the full backend lives at
   `*.pages.dev` (or a custom subdomain) behind login.

The Hono server isn't yet ported to Cloudflare Pages Functions. Phase
options:
- **A — minimal:** wrap `src/server/index.ts` as a Pages Function under
  `functions/api/[[catchall]].ts` using `hono/cloudflare-pages`. Works
  with the same code; replace the `@hono/node-server` `serve()` call.
- **B — split:** keep the Hono server running on a Render/Fly box and
  let Cloudflare Pages serve only the static assets (proxy `/api/*`
  to the Hono host). Less elegant but zero refactor.

Decision deferred to next session.

---

## 13. End-to-end smoke battery (hits all the seams)

```bash
# Type-check
npx tsc -b --noEmit

# Build
npm run build

# Boot
npm run dev               # web :5173, api :8787

# Anonymous /api/me → role:"anon"
curl -s http://localhost:8787/api/me

# Auth flow
TOKEN=$(curl -s -X POST "https://{ref}.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"…","password":"…"}' | jq -r .access_token)

# Authed /api/me → role:"instructor"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/me

# Authed event insert
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sessionId":"smoke","kind":"node_open","payload":{"nodeId":"c_human_development"}}' \
  http://localhost:8787/api/events

# Verify row stamped with auth.uid
npx tsx --env-file=.env.local scripts/verify-events.ts

# Verify RLS
npx tsx --env-file=.env.local scripts/verify-rls.ts
```

---

## 14. Rotation / clean-up checklist

- [x] Revoke the Supabase PAT (`sbp_…`) at
      https://supabase.com/dashboard/account/tokens
- [ ] Change the admin temp password (logged once in chat — rotate)
- [ ] When students get accounts: set `user_metadata.cohort_id`
- [ ] Before IRB submission: write a per-cohort consent gate that
      blocks `event_log` writes until the user has accepted

---

## 15. What this doc deliberately doesn't cover

- The CSCL research design (S1–S7) — that's the README and the
  `ANALYTICS_RESEARCH_MAP.md` (in progress).
- Schema-vs-instrumentation drift: 10 of 27 declared `EventKind` values
  have no emitter; `alignment_scores` and `discourse_networks` have no
  writer. Tracked separately as wiring-debt for Phase A/B.
- Mirror Mode S5 — `AlignmentGauge.tsx` re-renders silently with no
  `mirror_glance` event firing. Wiring is < 30 LOC, blocked on this
  setup landing first.
