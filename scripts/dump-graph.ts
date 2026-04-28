/**
 * Dump the live graph (nodes + edges + seed paths) to public/graph.json so the
 * static GitHub Pages build can ship without a server. Run this before
 * `vite build --mode ghpages`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, schema } from "../src/server/db/client.js";
import { loadSeedIfEmpty } from "../src/server/db/init.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "public", "graph.json");

const seedResult = await loadSeedIfEmpty();
console.log("[dump-graph] seed:", seedResult);

const [nodes, edges, paths] = await Promise.all([
  db.select().from(schema.coreNodes),
  db.select().from(schema.coreEdges),
  db.select().from(schema.learningPaths)
]);

const payload = {
  nodes,
  edges,
  paths: paths.map((p) => ({ ...p, nodeSequence: p.nodeSequenceJson as string[] }))
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(payload));
console.log(`[dump-graph] wrote ${outPath}`);
console.log(`[dump-graph] ${nodes.length} nodes · ${edges.length} edges · ${paths.length} paths`);
process.exit(0);
