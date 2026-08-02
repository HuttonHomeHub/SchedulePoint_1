---
'@repo/api': patch
'@repo/web': patch
---

Build `@repo/layout` in the images and in CI, and gate the build contract

ADR-0069 added a third shared workspace package and its own Consequences section named the
obligation that comes with one (ADR-0019: a shared package ships compiled output, so every consumer
must build it first). The three lines that discharge it — the `COPY` and the `pnpm --filter … build`
in each app's Dockerfile, plus the CI e2e job's direct "Build shared packages" step — were never
added, so both images and the Playwright web server failed with
`Cannot find module '@repo/layout'`: an error naming a module that plainly exists.

Nothing local could see it. A developer's checkout already has `packages/layout/dist` from an
earlier build, so the whole pre-push gate passes — lint, typecheck, 3,323 unit tests, the API e2e
against a real Postgres, and both flag-on journeys — and the failure appears only on a clean
machine, minutes into CI, inside `nest build`.

`pnpm check:build-contract` now asserts it: every `@repo/*` an app lists in `dependencies` is
COPYd and built in that app's Dockerfile and built in the CI step. It runs in the quality job
beside the doc-link and playbook checks, needs no database, and was verified to fail against the
exact defect before being wired in.
