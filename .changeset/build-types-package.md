---
'@repo/api': patch
'@repo/types': patch
---

Fix the API container crashing on boot with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
`@repo/types` shipped raw TypeScript (its `exports` pointed at `src/index.ts`),
which tools transpile but plain Node cannot load — so the production image
crashed when the compiled API `require`d it. `@repo/types` now builds to
`dist/` (ESM + declarations) and its `exports` resolve to the compiled output at
runtime, while the `development`/`types` conditions still point at source so
dev, tests, and typecheck are unchanged. The API and web Docker builds compile
`@repo/types` before the app, and `turbo dev` depends on it too.
