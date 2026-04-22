import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";

const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), "data/app.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const libsql = createClient({ url: `file:${dbPath}` });
export const db = drizzle(libsql, { schema });
export { schema };
