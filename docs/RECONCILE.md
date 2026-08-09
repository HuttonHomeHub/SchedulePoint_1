# Runbook — the reconciliation pass

> The periodic check that this repository still describes itself accurately.
> Backed by [ADR-0058](adr/0058-drift-control-and-the-reconciliation-pass.md),
> which records why it exists and why several of the steps are automated.
>
> **Last full pass: 2026-08-09.** Record each pass in
> [`DECISIONS.md`](DECISIONS.md), add a row to [Passes run](#passes-run), and
> update that date. **All three, in the same commit** — this line said
> `2026-07-28` while the table below recorded a pass on `2026-07-31`, so the
> drift-control document had drifted about its own drift control. Anyone reading
> only the banner would have thought the pass was four days more overdue than it
> was; anyone reading only the table would have thought the opposite.

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

| Gate                                       | Catches                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm format:check` / `lint` / `typecheck` | The ordinary things.                                                         |
| `pnpm check:doc-links`                     | A relative link to a file that no longer exists.                             |
| `prisma:check-drift`                       | `schema.prisma` disagreeing with the migrations.                             |
| `pnpm test` (coverage thresholds)          | Coverage sliding below the recorded floor.                                   |
| `surface-seams.structural.test.ts`         | Application code reaching past a design-system seam.                         |
| `styles/token-contrast.test.ts`            | A colour pair below its WCAG ratio, across themes × surfaces.                |
| Flag-off parity suites                     | A flagged change altering the rollback path.                                 |
| `pnpm check:counts`                        | The stage-banner figures going stale — in `CLAUDE.md` **and** `README.md`.   |
| `pnpm check:claims`                        | A citation into a dependency's internals that has moved.                     |
| `pnpm check:flags`                         | A feature flag with no enablement date, or a retirement batch past its date. |

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
ls -d apps/web/e2e* | wc -l                          # Playwright suites (base + flag-scoped)
ls apps/web/src/features | wc -l                     # web feature modules
ls apps/api/test/*.e2e-spec.ts | wc -l               # Supertest e2e specs
find apps/web/src -type f | wc -l                    # web source files
pnpm check:playbook                                  # prints the seeded-plan count
```

`CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`,
`docs/TESTING.md`, `docs/BACKEND_ARCHITECTURE.md`,
`docs/FRONTEND_ARCHITECTURE.md`, `apps/api/README.md`, `apps/web/README.md` and
`.claude/agents/feature-analyst.md` all quote several of these. The last four
were added to this list on 2026-08-04, because the pass before it swept only the
first four and left the rest stale — including a web README claiming the client
was "foundation only".

**`CLAUDE.md`'s and `README.md`'s banner figures are no longer your job —
`pnpm check:counts` owns them** (ADR-0076). Run it; if it is red, fix the prose.
This step now covers only the numbers quoted in the _other_ files above.

`README.md` was added to the gate on **2026-08-09**, and the pass that did it is
the argument for the standing instruction below. The figures were duplicated in
four documents with **one** of them gated, and the front door — the first thing
any reader meets — was five days stale and twelve ADRs out. Widening the gate
then found it passing for the wrong reason: only one of its six patterns
tolerated a markdown line break, so `23 flag-scoped\n> Playwright suites` was
invisible to it. Someone had met that exact problem, fixed the pattern in front
of them, and left five. **When you patch a gate, ask whether the same hole is in
its siblings.**

The reason that changed is worth carrying: this section used to end "write the
date you counted next to the numbers, and treat the date rather than the word
'recounted' as the claim". That is correct advice which cannot work. The banner
said "recounted 2026-08-04", and on 2026-08-05 five of its six figures were
wrong again — because a reader who trusts a number does not check its date, and
a reader who checks the date has already been misled once. Telling people to
re-run `ls | wc -l` is the vigilance ADR-0058 exists to replace.

**So the standing instruction for anything on this list is: if you find yourself
writing "remember to re-check X", write a gate for X instead.** And when you do,
**point it at every copy of the claim, not the one in front of you** — the
2026-08-09 pass found the gate correct and aimed at a quarter of its subject.
Two of the ungated copies were then **deleted** rather than gated, which is the
cheaper answer whenever a document is restating a number it does not own.

### 2. Check the dependency claims

The highest-yield check, and the least obvious. **A document naming a library is
a claim that the library is installed.** Past passes found docs describing
Radix, CASL, OpenTelemetry, BullMQ, Redis, S3 and a `lib/telemetry.ts` facade —
none of which existed.

For each library or module a doc names, confirm it: `package.json` for a
dependency, `ls` for a file. If it is absent, the doc is describing an intention
and must say so.

**Then check the manifests themselves.** A `package.json` `description` is prose
that no reviewer reads and no gate covers, so it rots undisturbed — the first
pass corrected five documents that claimed shadcn/ui and left the claim standing
in `apps/web/package.json`, where it then shipped in a release. Sweep every
manifest, not just the docs that quote them:

```bash
grep -rn '"description"' --include=package.json . | grep -v node_modules
```

**Claims about a library's _internals_ are a separate species, and they are now
gated** (ADR-0076, `pnpm check:claims`). "Is Radix installed?" is answered by
`package.json`. "Does `runInBackgroundOrAwait` rethrow?" is answered only by
opening the file — and this repository makes 34 such file-and-line claims, several
of which whole ADRs turn on. They were invisible to every check here: the package
is installed, the doc reads as authoritative, and a minor bump silently moves every
cited line.

The gate pins each citation's package **version**, its path, its line range and an
**anchor** taken from the code that was read, and refuses any citation absent from
`scripts/dependency-claims.json`. Your job in this pass is therefore only the part
it cannot do: **read the prose around a citation and ask whether it still describes
what that code does.** The gate proves the line is where we said it was; only you
can say the sentence beside it is true.

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

## Passes run

| Date       | Trigger                       | What it found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-09 | ADR-0083/0084 epic boundary   | **The count gate was aimed at one of four copies.** `check:counts` has gated `CLAUDE.md`'s banner since ADR-0076, and the same figures sat ungated in `README.md` (the front door — **73 ADRs against 85**, and 23 Playwright suites against 29, five days after "counted 2026-08-04"), `apps/web/README.md` (three of four wrong) and `docs/FRONTEND_ARCHITECTURE.md`. Widening the gate then found it **passing for the wrong reason**: `README.md` wraps as `23 flag-scoped\n> Playwright suites`, and only ONE of the six patterns carried the `\\s*>?\\s*` that survives a line break — so somebody had hit this exact problem, patched the pattern in front of them, and left five to be found by a wrong number surviving a green check (the ADR-0077 M0 shape, one gate along). All six are now tolerant by construction; the front door is gated; the two internal copies are **deleted**, because a document restating a number it does not own has no reason to hold it. `ROADMAP.md` was silent on **ADR-0074 through ADR-0085** — the same failure as the two rows below, two epics later, which is why that check is a numbered step and not a habit. **Step 7 pointed at the flags:** 58 `VITE_` flags, `flagDefaultOff` called **zero** times, and no decision anywhere saying when a rollback contract ends — fourteen of them with no enablement date recorded in any artefact. That became ADR-0084 and `pnpm check:flags`, whose own D4 it caught backwards on the first run. And `docs/BACKLOG.md`'s "Privacy operations `M`" turned out not to be work at all but an unresolved collision with the audit log's `ENABLE ALWAYS` triggers — ADR-0085.                                                                                                                                                                                             |
| 2026-08-04 | ADR-0073 epic boundary (C4)   | **Every one of the six headline counts was wrong**, three days after a banner claiming they were recounted. `apps/web/README.md` said "**foundation only. No application features are implemented yet**" beside 748 source files, and claimed both shadcn/ui and a `lib/telemetry` that has never existed — the two failures ADR-0058 was written about, sitting in the one file no previous pass had opened. **ADR-0006's shadcn/Radix clause was never adopted** and nothing said so, so the register instructed a reader to copy in primitives the codebase deliberately hand-rolls. Three `CLAUDE.md` §17 claims were false: no audit log (shipped), no data-export path (three of them), and a "logging stub" mail port (a real SMTP adapter). **Hosting was settled on 2026-08-01 and four documents still called it the open question.** `ROADMAP.md` was silent on ADR-0067–0073 — the same failure as the row below, one epic later. `ARCHITECTURE.md` never mentioned the audit log. Two agents asserted absent libraries as invariants and two pointed at files ADR-0057 deleted. Debt rows #1/#7/#8/#12/#37 described expired premises — #8's "CSP not finalised" meant **no CSP header at all**, and #37 listed a canvas feature that had shipped five days earlier in a different shape. And this file's own banner disagreed with its own table. **Step 7 earned its keep:** pointed at PR #225 — the app's first outbound transport, merged with no review pass — security and devops independently found that the mail stub logged a **live email-verification token** on the default no-SMTP path, which is the running deployment; and that the "a verification failure fails the sign-up" guarantee asserted in three places **does not hold**, because Better Auth swallows the rejection. Both folded; the second's operator-signal gap is #94. |
| 2026-07-31 | ADR-0066 epic boundary (M5.5) | `CLAUDE.md` had **no ADR-0066 entry at all** — five milestones with nothing in the operating manual; the repo-layout tree omitted all three new workspace packages; `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` were silent on the epic. Found by grepping for the ADR number, not by reading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Older passes are recorded in the ADRs and commits they produced (ADR-0058 was
written after four of them); this table starts where the epic-boundary rule did.

## The one rule

**Verify the claim; do not trust the document.** Every drift found so far was a
confident sentence that nobody had re-checked — including sentences written
during a previous reconcile. Read the code.
