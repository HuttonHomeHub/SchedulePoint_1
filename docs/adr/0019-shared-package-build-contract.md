# ADR-0019: Shared workspace packages ship compiled output

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Engineering

## Context

`@repo/types` is consumed both by tooling that understands TypeScript source
(Vite, Vitest, `tsc`, the Nest dev server via ts transpilation) and, after
`docker build`, by **plain Node** running the compiled API (`node dist/main.js`
does `require('@repo/types')`).

Originally the package exposed only its TypeScript source
(`exports` → `src/index.ts`). Tooling coped, but the production container
crashed on boot: Node cannot execute raw `.ts` from `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). The first fix — repointing the
package's top-level `types` field at the built `dist/` declarations — then broke
CI, because the API compiles with `moduleResolution: "Node"` (classic), which
**ignores the `exports` map and reads the top-level `types`/`main` fields**, so
any `tsc` run outside Turbo's `^build` graph (the template verification script;
the e2e Playwright web server) failed to resolve the package until `dist/`
existed. Two separate contracts — "resolves for the type-checker" and "loads at
runtime" — were being served by one field and kept colliding.

## Decision

Shared workspace packages that are loaded at runtime **ship compiled output**
and declare an explicit dual contract:

- `build` compiles `src/` to `dist/` (ESM JS + `.d.ts`) via a dedicated
  `tsconfig.build.json`.
- `exports` carries the runtime/tooling split: `types` and `development` →
  `src/index.ts` (so dev servers, tests, and `exports`-aware resolvers use
  source), `default` → `dist/index.js` (so Node loads compiled JS).
- The **top-level `types` field points at `src/index.ts`**, so the classic
  `moduleResolution: "Node"` type-checker resolves from source with **no build
  required**, while the top-level `main` and `exports.default` keep the runtime
  pointed at `dist/`.
- Any build step that runs a package's compiled output **outside Turbo** must
  build the shared package first. The API and web Docker builds compile
  `@repo/types` before the app; the CI `e2e` job builds it before the Playwright
  web server; `turbo dev`/`build`/`typecheck` depend on `^build`.

## Alternatives considered

- **Switch the API to `moduleResolution: "NodeNext"/"Bundler"`** so `tsc`
  follows `exports` and resolves `types` from source without a build. A larger,
  cross-cutting change to the compiler contract (import extensions,
  `verbatimModuleSyntax` interactions) for the whole backend; deferred as its
  own decision rather than bundled into a hotfix.
- **Ship only compiled output and point every condition at `dist/`** — forces a
  build before typecheck/test everywhere and slows the inner loop; loses
  go-to-source navigation in dev.
- **Keep source-only exports** — the original state; crashes plain Node at
  runtime. Rejected.

## Consequences

- Runtime (Node) loads `dist/`; the type-checker and dev tooling read `src/`.
  Both the container boot crash and the CI type-resolution failure are resolved
  without a compiler-wide change.
- New runtime-loaded shared packages must follow this contract (build to
  `dist/`, dual `exports`, top-level `types` → source) and ensure any
  non-Turbo consumer builds them first — otherwise the same two failure modes
  recur.
- Minor footgun: a bare `rm -rf dist` that leaves a stale `*.tsbuildinfo` makes
  `tsc` believe the build is current and emit nothing; `pnpm clean` (or deleting
  the tsbuildinfo) restores a correct incremental build. Fresh CI/Docker builds
  are unaffected.

## References

- `packages/types/package.json`, `packages/types/tsconfig.build.json`,
  `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.github/workflows/ci.yml`,
  `turbo.json`.
- ADR-0002 (Turborepo + pnpm), ADR-0020 (CI image smoke-boot).
