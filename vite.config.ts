import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Modes:
 *   default        — local dev (`npm run dev`); base "/", supabase active
 *   ghpages        — GitHub Pages full-app deploy; base "/counseling-graph-cscl/",
 *                    supabase active. Requires VITE_SUPABASE_URL +
 *                    VITE_SUPABASE_PUBLISHABLE_KEY at build time.
 *   demo-static    — legacy static-only demo (no Supabase, no auth);
 *                    pre-baked public/graph.json + localStorage event ring buffer.
 *                    Use scripts/dump-graph.ts before building this mode.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: "src/client",
  envDir: __dirname,
  base: mode === "ghpages" || mode === "demo-static" ? "/counseling-graph-cscl/" : "/",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },
  define: {
    __STATIC_MODE__: JSON.stringify(mode === "demo-static")
  },
  publicDir: path.resolve(__dirname, "public"),
  server: {
    port: 5173
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
}));
