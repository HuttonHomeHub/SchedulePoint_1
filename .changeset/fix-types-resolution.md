---
'@repo/types': patch
---

Fix `@repo/types` so it resolves under classic `tsc` without a prior build.
Its top-level `types` field pointed at `./dist/index.d.ts`, but the API compiles
with `moduleResolution: "Node"`, which ignores `exports` and reads that field —
so any `tsc` run outside Turbo's `^build` graph (the `verify-template.sh`
type-check and the e2e Playwright web server) failed with `TS2307` because
`dist/` had not been built. The field now points at `./src/index.ts`, so
type-checking resolves from source everywhere; the Node runtime is unaffected
because it resolves the `exports.default` condition to `./dist/index.js`.
