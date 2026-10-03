# ADR-0172: A soft-delete filter is stated at the query, and the build refuses a read that states none

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** James Ewbank (product owner — option B, and "check edits too", 2026-10-03), with
  Claude Code
- **Builds on:** ADR-0058 (computed gates), ADR-0076 (wrong claims are a defect class), ADR-0096
  (deleted work expires; the bin and the sweep must see deleted rows), ADR-0110 (a gate is verified
  against the defect it names), ADR-0124 (find by structure, refuse by declaration), ADR-0136 (the
  roster is derived), ADR-0164 (a gate has no pass-with-findings outcome)
- **Spec:** [`docs/specs/soft-delete-filter/`](../specs/soft-delete-filter/feature-spec.md); closes
  `docs/BACKLOG.md` "Centralise the soft-delete filter"

## Context

`docs/DATABASE.md` "Soft deletes" said that "all queries exclude soft-deleted rows by default (a
Prisma extension/base repository enforces this centrally)". Nothing does. `PrismaService` is a bare
`extends PrismaClient` with a transaction timeout (`apps/api/src/prisma/prisma.service.ts:39-45`), and
`rg '\$extends|\$use\(' apps/api/src` finds no match on 2026-10-03. `docs/REFERENCE_FEATURE.md` said
the repository is "the only Prisma consumer"; it is not (below). Both are ADR-0076 wrong claims in the
documents that tell people how to write queries.

What is true, measured on 2026-10-03:

- **20 of 34 models** carry `deletedAt`.
- Filtering is **per query**. Sixteen repositories carry a private `active(where)` helper returning
  `{ ...where, deletedAt: null }`; two shared predicates serve rules used across modules
  (`invitation-predicates.ts`, `live-assignment.ts`); everywhere else the clause is written inline.
- **Services read directly**, not only repositories: `activities.service.ts` has 15 single-line read
  sites, `baselines.service.ts` 3, `interchange.service.ts` 3, and `common/hierarchy/*` 26. A
  per-repository convention cannot be the enforcement point.
- There is **no recorded leak** of a deleted row to a user. One near-miss (the landing counted
  invitations without the filter) was latent and is fixed by a shared predicate.
- The one soft-delete defect that **shipped** was an over-filter: a staff diagnostic excluded
  deleted calendars and so missed the activities it existed to find. At least 14 reads, and the
  restore and expiry writes, must see deleted rows by design.
- `@prisma/client` 6.19.3 exposes `$extends` and no `$use`.

## Decision

- **D1.** Soft-delete filtering stays **explicit at each query**: a repository's `active()` helper, a
  shared predicate, or an inline `deletedAt` key.
- **D2.** A **structural gate** refuses any read **or write** (`update`, `updateMany`, `upsert`,
  `delete`, `deleteMany`, and nested writes) on a soft-deletable model — top-level, to-many nested,
  `_count`, or raw SQL — that states no `deletedAt` stance and carries no declaration. Any `deletedAt`
  value (`null`, `{ not: null }`, `{ lt }`) is a stance.
- **D3.** A deliberate exception is **declared in source with a reason**, in one grammar
  (`// soft-delete: any-state — <reason>` or `deleted-only`), per call or per enclosing function. An
  empty reason, or a declaration that precedes no matching call, fails. The gate prints every
  declaration.
- **D4.** The soft-deletable roster is **derived from `schema.prisma`**, never listed by hand.
- **D5.** `create`/`createMany` and to-one relation reads are outside the gate. Triggers to revisit are
  in the spec (§4.8).
- **D6.** `docs/DATABASE.md` "Soft deletes" and `docs/REFERENCE_FEATURE.md` describe D1–D5.

**Delivery.** The gate is delivered in milestones M2–M5 of the spec's plan, and each milestone's PR
flips the standards' wording for the rule it adds to present tense. All five milestones shipped on 2026-10-03. **M2** delivered the top-level read rule and the declaration
grammar, in `apps/api/src/common/query/soft-delete-filter.structural.spec.ts`; **M3** added writes
(`update*`, `upsert`, `delete*`, nested writes); **M4** added to-many `include`/`select`/`_count`, and
its findings were fixed by stating the filter (`baseline.repository.ts`, two `_count`s); **M5** added
raw SQL, including `Prisma.sql` fragments.

## Alternatives considered

- **A — a global Prisma client extension with an opt-out.** It would change runtime behaviour at
  exactly the reads that are deliberately unfiltered: restore would 404 and the hours-per-day lookup
  would drop a soft-deleted calendar and reinterpret durations, so every such site must migrate in the
  same release. It cannot see raw SQL or nested/`_count` reads, respects a wrong explicit
  `deletedAt`, and changes the injected client type (`Prisma.TransactionClient` is written in 45
  files). Not chosen. (Its two behavioural premises, that an extension sees only the top-level
  operation and that `$queryRaw` bypasses it, are Prisma's documented behaviour and were not
  re-proved here; they would be spiked first if A were reconsidered.)
- **C — views or row-level security.** The only option that sees everything, but it is a schema change
  (database-architect), a policy `USING` would also reject the soft-delete stamp itself, restore and the
  expiry would need opt-outs, and the 14+ legitimate exceptions become runtime failures in
  production. Revisit on a confirmed user-visible leak.
- **B with a custom ESLint rule.** Needs a local plugin and type-aware linting the repository does not
  run; the established gate tier is a Vitest structural spec.
- **B with a SQL-level e2e observer.** Sees real statements but only for paths the e2e suites drive.
  A trigger-based follow-up.
- **A base repository class.** Services read directly, so it covers only repositories that extend it.
- **Do nothing.** The false standard still has to be corrected, so this was never available.

## Consequences

- **Positive.** No runtime change and `computeSchedule` untouched: the gate is a test file and the
  declarations are comments. Exceptions become visible beside the code. Raw SQL, nested to-many reads
  and `_count`, and writes are covered, which an extension would not.
- **Negative.** A **wrong** stance (`{ not: null }` where `null` was meant) still passes. A `where`
  assembled in another function costs a declaration. Creates and to-one reads are unchecked. It is the
  first use of the TypeScript compiler API in a gate here, so a small scanner must be maintained.
- **Measured at close-out (2026-10-03).** The scan adds about one second to `pnpm test`. It examines
  307 reads, writes and nested selections (112 of them writes, the spec's §4.11 count) and 36 raw statements that name a soft-deletable table, and prints 27
  declarations covering 76 calls. Triage found three real leaks (`org_members` reads, fixed in #772 and
  recorded as closed #436) and the baseline `_count`s of M4; everything else was deliberate and is
  declared with its reason.
- **A declaration on raw SQL covers every table in its statement**, so a later-removed `deleted_at`
  on a to-one parent join under a declared statement is not caught; the reason must name the tables.
- **Advisory at the merge boundary**, like every gate here: `main` is unprotected (CLAUDE.md §8).
- **Follow-ups.** A genuine leak found by labelling is fixed in its own PR with a regression test and
  a patch changeset. The M4 `_count` filter is the epic's only intended runtime change.

## References

- `docs/specs/soft-delete-filter/feature-spec.md` §0 (evidence), §4.5 (options), §4.11 (writes)
- `docs/TECH_DEBT.md` #139 (two child tables are not stamped by the hierarchy cascade)
