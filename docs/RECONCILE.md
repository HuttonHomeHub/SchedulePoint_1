# Runbook — the reconciliation pass

> The periodic check that this repository still describes itself accurately.
> Backed by [ADR-0058](adr/0058-drift-control-and-the-reconciliation-pass.md),
> which records why it exists and why several of the steps are automated.
>
> **Last full pass: 2026-07-27.** Record each pass in
> [`DECISIONS.md`](DECISIONS.md) and update that date.

## Why this exists

`CLAUDE.md` used to say "review periodically". That word produced months of
drift: the operating manual claimed the app had no domain code while nineteen
modules were shipping, three documents asserted a coverage bar that could not be
measured because the provider was never installed, and the front-door README's
CI badge pointed at a repository that does not exist.

None of that was carelessness at the time of writing. Each claim was true when
made. **Claims rot**, and nothing was scheduled to notice.

## When to run it

**Trigger: at each epic boundary** — the same moment an epic's last milestone
lands and before its flag flips default-on. That is when the most claims have
just changed and the context is still fresh.

**Hard floor:** if the date above is more than **three months** old, the pass is
overdue regardless of where the work has got to. Note the date and run it.

**Also run a partial pass** when you delete a directory, remove a dependency, or
resolve a register row — those three actions have each produced drift within a
day of the change.

## What is already automated (do not redo by hand)

These run in CI on every push. If one is red, fix it there — the manual pass
below assumes they are green.

| Gate                                       | Catches                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `pnpm format:check` / `lint` / `typecheck` | The ordinary things.                                          |
| `pnpm check:doc-links`                     | A relative link to a file that no longer exists.              |
| `prisma:check-drift`                       | `schema.prisma` disagreeing with the migrations.              |
| `pnpm test` (coverage thresholds)          | Coverage sliding below the recorded floor.                    |
| `surface-seams.structural.test.ts`         | Application code reaching past a design-system seam.          |
| `styles/token-contrast.test.ts`            | A colour pair below its WCAG ratio, across themes × surfaces. |
| Flag-off parity suites                     | A flagged change altering the rollback path.                  |

**Prefer adding a gate to adding a checklist item.** A gate that computes runs
every push; a checklist item runs when someone remembers. Every row above
started life as something a human was supposed to notice.

## The manual pass

Everything here needs judgement, which is why it is not a script. Work through
it in order — the early steps surface facts the later ones depend on.

### 1. Re-derive the counts

Prose is full of numbers that quietly go stale. Get the real ones first, then
grep the docs for the old ones:

```bash
ls apps/api/src/modules | wc -l                      # feature modules
grep -c '^model ' apps/api/prisma/schema.prisma      # Prisma models
ls apps/api/prisma/migrations | grep -c '^2'         # migrations
ls docs/adr/[0-9]*.md | wc -l                        # ADRs
ls apps/web/e2e* -d | wc -l                          # Playwright suites
```

`CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md` and `apps/api/README.md` all
quote several of these.

### 2. Check the dependency claims

The highest-yield check, and the least obvious. **A document naming a library is
a claim that the library is installed.** Past passes found docs describing
Radix, CASL, OpenTelemetry, BullMQ, Redis, S3 and a `lib/telemetry.ts` facade —
none of which existed.

For each library or module a doc names, confirm it: `package.json` for a
dependency, `ls` for a file. If it is absent, the doc is describing an intention
and must say so.

### 3. Reconcile accepted-but-unbuilt ADRs

An accepted ADR is a decision, **not** an inventory. Walk
[`ARCHITECTURE.md` §10](ARCHITECTURE.md) and confirm each listed ADR is still
unbuilt, and that no newly-built capability is still listed as absent.

### 4. Verify each register row against the code

Take [`TECH_DEBT.md`](TECH_DEBT.md) row by row and ask **is this still true?**
Not "do I remember this being true". Past passes found a row understating a
duplication by 5×, a row describing work that had shipped, and rows resolved in
the title while the remediation column still described the work as outstanding.

Delete resolved rows; rewrite partly-resolved rows to be about what is **left**.

### 5. Check the docs still describe the system

For each document in [`docs/`](README.md), read its opening status claim and its
most specific technical assertions. The failure mode is a document that was
written accurately and never revisited — `FRONTEND_ARCHITECTURE.md` said "no
application features are implemented yet" while 23 feature modules shipped.

Mark anything aspirational as **_not yet built_** rather than deleting the
standard: the standard is still what we want when the work lands.

### 6. Check the exemplars and the agents

- [`REFERENCE_FEATURE.md`](REFERENCE_FEATURE.md) names three real modules as
  exemplars (ADR-0057). Confirm each still exists and is still representative.
- Each file in [`.claude/agents/`](../.claude/agents/) carries a **SchedulePoint
  invariants** section. If a cross-cutting invariant changed since the last
  pass, the agent that polices it needs updating — an agent asserting a stale
  invariant is worse than one asserting none.

### 7. Run the specialist agents over recent work

Reviewers earn their keep here. The 2026-07-27 pass ran four over nine
unreviewed commits and they found: a live `aria-describedby` bug in a file the
commit had half-migrated, a public API that could not do the job it existed
for, a latent copy of a just-fixed bug in a sibling primitive, and an
overstated claim in `DECISIONS.md`.

Point them at a **real, unreviewed diff** — not something already reviewed.
Give each the part of the diff its invariants section covers.

### 8. Record the pass

Write what changed and, more importantly, **what was found wrong**, in
[`DECISIONS.md`](DECISIONS.md). The findings are the evidence that the next
pass is worth running. Update the date at the top of this file.

## The one rule

**Verify the claim; do not trust the document.** Every drift found so far was a
confident sentence that nobody had re-checked — including sentences written
during a previous reconcile. Read the code.
