import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });
const tables = await sql<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
`;
const types = await sql<{ typname: string }[]>`
  SELECT typname FROM pg_type WHERE typcategory='E' ORDER BY typname
`;
console.log("Tables:", tables.map((t) => t.tablename).join(", "));
console.log("Enums:", types.map((t) => t.typname).join(", "));
await sql.end();
