#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verify the reference-feature template still compiles and passes its unit
# tests against the current codebase — so the canonical implementation standard
# (docs/REFERENCE_FEATURE.md, ADR-0014/0015) can never silently rot.
#
# The template lives outside the app (apps/api/examples/) and references a
# `ReferenceItem` Prisma model that is deliberately NOT in the live schema. This
# script *materialises* it exactly as a developer would (copy the module in, add
# the model, generate the client), type-checks and unit-tests it, then reverts.
#
# No database is required (the unit tests mock the repository; the e2e spec is
# only type-checked). Safe to run locally and in CI. Idempotent.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

API=apps/api
TEMPLATE=$API/examples/reference-feature
MODULE_DEST=$API/src/modules/reference
E2E_DEST=$API/test/reference.e2e-spec.ts
SCHEMA=$API/prisma/schema.prisma

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m==>\033[0m %s\n' "$1" >&2; exit 1; }

# This script writes into the working tree, so everything it will later delete
# or overwrite must be provably its own. Refuse to start otherwise: a developer
# who has genuinely built `src/modules/reference` should not lose it to a
# verification run's cleanup.
if [ -e "$MODULE_DEST" ]; then
  fail "$MODULE_DEST already exists — refusing to overwrite it. Remove or rename it first."
fi
if [ -e "$E2E_DEST" ]; then
  fail "$E2E_DEST already exists — refusing to overwrite it. Remove or rename it first."
fi

# Back the schema up byte-for-byte rather than reverting it with
# `git checkout --`, which restores the *committed* file and so silently
# discards any uncommitted migration work in progress — it did exactly that
# once (TECH_DEBT #52). A copy restores what was actually there, which also
# means the script stays usable while a schema change is in flight: verifying
# the template against an in-progress model is precisely when you want it.
SCHEMA_BACKUP=$(mktemp)

cleanup() {
  info 'Reverting materialised template'
  rm -rf "$MODULE_DEST" "$E2E_DEST"
  if [ -s "$SCHEMA_BACKUP" ]; then
    cp "$SCHEMA_BACKUP" "$SCHEMA"
    # A restore that didn't restore is worse than no restore, because nothing
    # would say so. Check it, and if it failed, keep the backup and name it.
    if cmp -s "$SCHEMA_BACKUP" "$SCHEMA"; then
      rm -f "$SCHEMA_BACKUP"
    else
      printf '\033[1;31m==>\033[0m Failed to restore %s — your original is at %s\n' "$SCHEMA" "$SCHEMA_BACKUP" >&2
    fi
  else
    rm -f "$SCHEMA_BACKUP"
  fi
  # Restore the model-less Prisma client so local dev isn't left confused.
  pnpm --filter @repo/api exec prisma generate >/dev/null 2>&1 || true
}
trap cleanup EXIT

info 'Materialising the reference template into the app'
mkdir -p "$API/src/modules"
cp -r "$TEMPLATE/module" "$MODULE_DEST"
cp "$TEMPLATE/reference.e2e-spec.ts" "$E2E_DEST"
# Snapshot before the append — cleanup restores from this, not from git.
cp "$SCHEMA" "$SCHEMA_BACKUP"
# Add the reference model to the schema (as `prisma migrate dev` copying would).
cat "$TEMPLATE/schema.reference.prisma" >>"$SCHEMA"

info 'Generating the Prisma client'
pnpm --filter @repo/api exec prisma generate >/dev/null

# Build the app's workspace dependencies so their compiled `dist` (the `.d.ts` the
# app type-checks against) exists. Turbo's own `typecheck` task gets this via
# `dependsOn: ["^build"]`; this bare `tsc --noEmit` bypasses Turbo, so build them
# explicitly (e.g. @repo/engine-conformance ships compiled output — ADR-0019).
info 'Building workspace dependencies (compiled output the app type-checks against)'
pnpm --filter "@repo/api^..." build >/dev/null

info 'Type-checking (module + e2e spec against the live codebase)'
pnpm --filter @repo/api exec tsc --noEmit

info 'Running the template unit tests'
pnpm --filter @repo/api exec vitest run src/modules/reference

info 'Template verified ✔ — it compiles and its unit tests pass.'
