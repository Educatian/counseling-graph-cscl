# Counseling × Clinical Knowledge Graph (CSCL)

Instrumented knowledge graph for 상담심리 / 임상심리 curricula — every click, path, and annotation is a research trace.

## Live demo
Static build (no backend) is deployed to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

## Local dev
```bash
npm install
npm run dev      # web :5173, api :8787
```

## Build a static bundle (for GitHub Pages)
```bash
npm run build:ghpages
```
This dumps `public/graph.json` from the SQLite seed, then builds with `base: /counseling-graph-cscl/`.
The client detects `__STATIC_MODE__` at build time and fetches `graph.json` instead of `/api/graph`;
`logEvent` writes to `localStorage` instead of POSTing.
