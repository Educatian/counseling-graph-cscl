/**
 * Dump the live graph (nodes + edges + seed paths) to public/graph.json so the
 * static GitHub Pages build can ship without a server. Run this before
 * `vite build --mode ghpages`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, schema } from "../src/server/db/client.js";
import { initDb, loadSeedIfEmpty } from "../src/server/db/init.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "public", "graph.json");

await initDb();
const seedResult = await loadSeedIfEmpty();
console.log("[dump-graph] seed:", seedResult);

const nodes = await db.select().from(schema.coreNodes).all();
const edges = await db.select().from(schema.coreEdges).all();
const paths = await db.select().from(schema.learningPaths).all();

const payload = {
  nodes,
  edges,
  paths: paths.map((p) => ({ ...p, nodeSequence: JSON.parse(p.nodeSequenceJson) }))
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(payload));
console.log(`[dump-graph] wrote ${outPath}`);
console.log(`[dump-graph] ${nodes.length} nodes · ${edges.length} edges · ${paths.length} paths`);
process.exit(0);
