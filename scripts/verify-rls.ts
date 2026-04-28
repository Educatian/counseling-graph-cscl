import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });

const rls = await sql<{ tablename: string; rls: boolean }[]>`
  SELECT tablename, rowsecurity AS rls
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`;
console.log("=== RLS enabled? ===");
for (const r of rls) console.log(`  ${r.tablename}: ${r.rls ? "ON" : "off"}`);

const pols = await sql<{ tablename: string; policyname: string; cmd: string }[]>`
  SELECT tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname
`;
console.log(`\n=== Policies (${pols.length}) ===`);
for (const p of pols) console.log(`  ${p.tablename}.${p.policyname} [${p.cmd}]`);

await sql.end();
