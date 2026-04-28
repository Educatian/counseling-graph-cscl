import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: "src/client",
  // .env.local lives at the project root, but Vite's `root` is src/client, so
  // we point envDir back at the project root or VITE_* vars don't get injected.
  envDir: __dirname,
  // For GitHub Pages we deploy under /counseling-graph-cscl/. Local dev stays at /.
  base: mode === "ghpages" ? "/counseling-graph-cscl/" : "/",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },
  define: {
    __STATIC_MODE__: JSON.stringify(mode === "ghpages")
  },
  publicDir: path.resolve(__dirname, "public"),
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8788", ws: true }
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
}));
