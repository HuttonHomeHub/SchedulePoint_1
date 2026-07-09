# ADR-0015: Template-driven feature development

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Principal Engineer, Technical Lead

## Context

We want every feature — built over many years by different people and AI
sessions — to look and behave the same: the same layering, error/response
envelopes, authorisation, validation, logging, and tests. ADR-0008 defines the
architecture and ADR-0014 kept a **reference feature** as a non-shipping
template. But two gaps remained:

1. There was no explicit rule that new features **must** be built from the
   template, so drift was still possible.
2. The template was **not CI-verified** (ADR-0014's accepted trade-off), so it
   could silently rot as the codebase evolved — unacceptable for something we
   now want to be the _canonical standard_.

The template also lacked an explicit **repository/data-access layer**, so it did
not fully demonstrate the layering ADR-0008 prescribes.

## Decision

1. **Feature development is template-driven.** New features are created by
   copying the reference template (`apps/api/examples/reference-feature/`) and
   adapting it. Diverging from its cross-cutting patterns (layering, auth,
   envelopes, DB standards, tests) requires a **documented architectural reason —
   an ADR**. This is recorded in `CLAUDE.md` and `docs/REFERENCE_FEATURE.md`,
   which is now the **canonical implementation standard**.
2. **The template is CI-verified.** `scripts/verify-template.sh` materialises the
   template into the app, generates the Prisma client, type-checks it, and runs
   its unit tests; the **"Verify feature template"** CI job runs it on every
   push. The template can no longer silently rot — refining ADR-0014's "not
   CI-verified" consequence.
3. **The template gains a repository layer.** `reference.repository.ts` is the
   only Prisma consumer for the feature and centralises the soft-delete filter
   and the optimistic-locked update, fully realising the controller → service →
   repository layering of ADR-0008.

## Alternatives considered

- **Documentation-only standard** — a written guide with no enforced, working
  exemplar. Weaker: prose drifts from reality and isn't verified. Rejected.
- **A code generator / Nest schematic** — powerful, but more machinery to build
  and maintain than warranted now. A copy-and-adapt template plus CI
  verification gives most of the benefit. Revisit if copying becomes a chore
  (noted in `docs/BACKLOG.md`).
- **Ship the template as a live module** — reintroduces the phantom
  table/endpoints ADR-0014 removed. Rejected.

## Consequences

- **Positive:** consistent features by default; a single, authoritative,
  always-green reference; the layering is demonstrated end to end; deviations are
  deliberate and documented.
- **Negative / trade-offs:** the template must be kept in step with cross-cutting
  changes (the CI job forces this); the verification script materialises the
  template in CI (isolated, reverted via a trap). The `ReferenceItem` model still
  lives outside the live schema, so the verification copies it in temporarily.

## References

- `docs/REFERENCE_FEATURE.md` (canonical standard), `scripts/verify-template.sh`,
  ADR-0008 (layering), ADR-0014 (non-shipping template)
