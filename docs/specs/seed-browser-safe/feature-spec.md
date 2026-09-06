# A package barrel may not force a Node-only module on browser consumers

- **Status:** Approved (product owner, 2026-09-06) · **Size:** S · **Closes:** `docs/TECH_DEBT.md` #252
- **Trigger:** ADR-0105 — this changes **a package's public export contract**, which is a named
  trigger requiring a spec whatever the size. It is deliberately its own document rather than a
  paragraph inside the Revision Compare epic, because the contract it changes is shared.

## 1. The problem, established by running rather than reading

`pnpm measure:draw` — the hand-run canvas benchmark whose numbers this repository quotes throughout
`docs/TECH_DEBT.md` #75, ADR-0026 §9 and ADR-0065 — **cannot bundle**:

```
pnpm exec esbuild scripts/link-routing-bench.ts --bundle --format=iife ...
✘ [ERROR] Could not resolve "node:fs"
```

Confirmed against the **unmodified** file by stashing (`AT HEAD esbuild exit: 1`), so it is a
property of the tree and not of any uncommitted edit.

**The cause is one line.** `5a5f00da` (2026-09-05) moved the fixture tier into `packages/seed` and
added `export * from './fixture/index.js'` to the barrel. That module's first statement is
`import { loadFixture } from '@repo/engine-conformance'`, and that package reads the fixture off
disk with `node:fs`/`node:url`. So **importing `scaleSpec` — a pure function that builds an object —
now drags a filesystem reader into the module graph**, and `apps/web/scripts/scale-scene.ts` does
exactly that to build a picture for a browser.

The move itself was right, and the commit's own comment says why: the fixture was the only tier of
four unreachable from anything but a CLI. What was missed is that the barrel is a **contract**, and
widening it widened what every consumer must be able to resolve.

### What is NOT affected, verified rather than assumed

No file under `apps/web/src` imports `@repo/seed` — so the shipped bundle never contained this and
no user was ever affected. The blast radius is two hand-run instruments
(`apps/web/scripts/scale-scene.ts` and `apps/web/measure-gantt/link-density.spec.ts`).

### Why nothing caught it

`measure:draw` is hand-run and deliberately **not** in CI, for the good reason that a container's
absolute timings are noise. The accepted cost of that decision is that the script can rot silently,
and it did — inside the very epic whose M0 needed it. This is #124's shape (a check that is green
because it is not running) applied to a tool rather than to a test.

## 2. The decision

**D1 — a tier is reachable by subpath, and the barrel stays the convenience.** `@repo/seed` gains
`./spec`, `./scale`, `./pairwise`, `./negative` and `./fixture` subpath exports. A browser consumer
imports `@repo/seed/scale` and resolves nothing it cannot run; the root export is unchanged, so
every existing importer keeps working and this is **additive**.

Rejected: making `loadFixture` a lazy `import()`. It would fix the bundling and turn `fixtureSpec`
async, which is a breaking change to real callers — a larger contract change bought to avoid a
smaller one.

Rejected: moving the fixture tier back out. That would restore the defect `5a5f00da` correctly
fixed.

**D2 — the two browser-side instruments import by subpath.** One-line changes.

**D3 — the workaround comes OUT.** `measure-revision-diff.mjs`'s `--external:node:*` flags were a
plaster on one caller while the barrel was the defect. Leaving them once the real fix lands would
mean the next reader finds a comment describing a problem that no longer exists — this register's
most-recorded failure. They go, and the bundle is verified to build without them.

**D4 — a gate, because a hand-run script rots silently.** `check:browser-safe` bundles every
browser-side entry point that imports a workspace package and fails if any cannot resolve. Cheap
(esbuild, no browser), runs in `prepush`, and catches the _next_ barrel widening rather than this
one. Verified red against the pre-fix tree.

## 3. What this does not do

The CPM engine is not imported and no migration runs. `@repo/engine-conformance` is unchanged — it
is a Node package and is entitled to be one; the defect was never that it reads files, but that a
browser consumer was made to resolve it.
