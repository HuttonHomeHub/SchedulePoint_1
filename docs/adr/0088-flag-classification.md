# ADR-0088 — Feature flags are classified, not scheduled

- **Status:** Proposed
- **Date:** 2026-08-10
- **Deciders:** product owner (asked the question that opened this: "it might be better not to
  retire them"), engineering
- **Supersedes:** ADR-0084 **D2, D3, D4a, D4b** (the 30-day horizon, the batch queue, the weighting
  and the cadence). **Keeps** ADR-0084 D1 (the machine-read `@enabled` tag), D5 (a retirement
  deletes its harness in the same commit) and D6 (`keep` with a written reason).
- **Reviews:** ui-architect, test-engineer, devops-reviewer, run as a decision rather than a code
  review.

## Context

ADR-0084 found 58 `VITE_` flags, every one default-on, and called each "a rollback contract nobody
had ever ended". It gave them dated tags, a 30-day horizon and a weekly retirement queue.

Batch 1 retired **one** flag and tried to retire three. CI caught the other two, because
`playwright.config.ts` pins them OFF for the whole base journey. That was recorded as a lesson about
harnesses. It was also the first evidence that **the schedule was the wrong instrument**, and this
ADR is the second.

The product owner then asked the question this decision exists to answer: _"it might be better not
to retire them."_ Taking that seriously rather than routing around it produced three findings that
between them dissolve the original framing.

## Decision

### D1 — The rollback contract is the developers', not the operator's. Measured, not argued

**A `VITE_` flag cannot be switched off on a deployed container, and never could.** Vite inlines
`import.meta.env.VITE_*` as a literal at build time, so no runtime lookup survives into the bundle —
and no build path sets one: `apps/web/Dockerfile` declares exactly **one** `VITE_` build arg
(`VITE_API_URL`), `.github/workflows/docker-publish.yml` — which builds every published image —
passes **no** build args at all, and `.dockerignore` excludes `**/.env` from the build context, so a
value written in the operator's stack file never reaches the daemon.

Every published image therefore carries every flag at its in-source default, which is on.

This is not a nuance. ADR-0084 argues throughout about a rollback contract; **for the person running
the application there has never been one**, and `.env.example` said otherwise beside three flags
("Set to `false` to fall back to … (rollback / opt-out)") on the one file an operator edits. That is
corrected, and `docs/DEPLOYMENT.md` — which said nothing about flags at all — now states which
switches work on a running container and which do not.

The argument was already in this repository, thirty lines above the flag block, about the CSP:
_"NOT a `VITE_` variable and deliberately so … read by nginx at CONTAINER START, not baked into the
bundle, which is what makes flipping to enforce — or rolling back from it — an env change rather
than a new image through the release train. A rollback that needs a release is slower than the
incident."_ The same sentence condemns the flag estate and nobody had read it that way.

**The operator's real rollback is image-tag pinning**, and it works: `web` and `api` version and
publish independently (ADR-0027), so pinning `WEB_IMAGE_TAG` rolls the client back without touching
the API or the schema — which matters, because migrations are forward-only (ADR-0018) — and
Watchtower only acts when `:latest` moves (ADR-0047), so a pinned tag is never silently re-pulled.

**The consequence for this decision:** retiring a flag costs the operator nothing they have. The
question is therefore entirely about what it costs **engineering**, which is where the estate turns
out not to be one thing.

### D2 — Classify, do not schedule. Three classes, and the discriminator is computed

ADR-0084 treated 57 flags as one population and sorted them by **age**. Age is not the risk;
**branch shape** is. A flag that selects between two screens and a flag that guards one line are the
same age and nothing else.

- **Class A — alternative surface.** The flag's value decides which of two **different components**
  is rendered. This is the "second product maintained forever" ADR-0084 describes, and for these
  flags the description is exactly right.
- **Class B — guard.** The flag appears only in `&&`, a conditional spread, a prop or a string
  ternary. Its production cost is one line. **These do not retire.**
- **Class C — the flag is really a test or rollout control.** Its production footprint is trivial but
  a Playwright harness pins it off to preserve coverage of a path users still reach. The work is
  replacing that coverage; the flag's deletion is a consequence, not the task.

**Class A is derived by a script, not by a reviewer's reading**, or it becomes the prose ADR-0058
exists to distrust. The discriminator that works, verified against this codebase: _a flag whose
value selects which of two different JSX roots a component returns._

```
return FLAG_ENABLED ? ( <A …/> ) : ( <B …/> )        // A ≠ B  ⇒  Class A
```

**That measurement is the reason this clause is stated the way it is.** The obvious rule — "the flag
appears in a ternary" — matches **48 of 57 flags** and is useless. The rule above matches **two**,
and they are the two an architect independently identified by reading the code:

| Flag                    | Selects                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `VITE_CANVAS_TOOLBAR`   | `<ToolbarPlanWorkspace>` vs `<Adr0030PlanWorkspace>` (`plan-workspace.tsx:70`) |
| `VITE_CANVAS_WORKSPACE` | `<PlanWorkspace>` vs `<LegacyPlanLayout>` (`plan-detail.tsx:66,112`)           |

A narrower first attempt — "two different capitalised arms anywhere in a `.tsx`" — found two
_different_ flags and missed both of these, because the real cases return multi-line JSX rather than
a bare identifier. The rule shipped is the one checked against the answer, and a Class A list that
is not reproducible by the script is a bug in the script, not a judgement call.

### D3 — Class A retires on merit and on epic-touch, with a standing cap

No dates. A Class A flag retires when an epic next touches that surface — ADR-0078's
extract-when-touched rule, which has the property a calendar lacks: **the person deleting the branch
is the person who just paid for it.**

And a **cap of three**. Adding a fourth alternative surface fails CI, which forces the conversation
at the moment it is cheap rather than eighteen months later. That is ADR-0058's ratchet shape aimed
at the thing that actually hurts: silent on the one-line guard, loud on the second product.

**`VITE_CANVAS_TOOLBAR` retires first, and on evidence rather than on its date.** It is the only flag
in the register whose flag-off branch has a **shipped, user-facing defect** attributed to it:
ADR-0080 wired `bulk` into one host and not into the layout this flag selects, unit-green throughout.
Engage with the product owner's position squarely — _"nothing is currently breaking"_ is true, and it
is true **of the flag-on world, which is the only world that exists**. That defect was not caused by
anyone switching the flag off. It was caused by the flag-off branch existing and quietly claiming a
feature it had not been given. Deleting it removes a defect source, not a safety net.

### D4 — Class B formally KEEPS, with a written reason

Roughly 28 flags are one line of production code. `VITE_PLAN_EDIT_LOCK` and `VITE_TSLD_EDITING` —
the two that blew up batch 1 — are **one line each**:

- `TsldPanel.tsx:1311` — `const editingEnabled = showDiagram && canEdit && TSLD_EDITING_ENABLED && …`
- `use-plan-edit-lock.ts:227` — `const penManaged = PLAN_EDIT_LOCK_ENABLED;`

For these, ADR-0084's "second product maintained forever" is **rhetorical**. Deleting the line
removes a line. They take ADR-0084 D6's `keep` with the reason _"guard-only; no second product to
maintain"_ — which is what that field was built for and, until now, had **zero** occupants.

This is the half of the product owner's instinct that was right, and it applies to most of the
estate.

### D5 — Class C: replace the coverage, not the flag, and not on a deadline

Ten flags are pinned OFF by a `playwright*.config.ts`. That pin is the real asset, and the register
**under-states it**: `VITE_CANVAS_WORKSPACE` is pinned in **seven** configs and its register entry
carries no note at all; `VITE_TSLD_EDITING` and `VITE_PLAN_EDIT_LOCK` are pinned in three and four
respectively, while ADR-0084's note discusses one.

But look at what the base journey's six editing specs actually prove. With `penManaged: false` the
client pen is inert and gating is role-only — **a world no shipped bundle can produce**, because the
flag is compiled on. So the product's main end-to-end editing coverage runs against a configuration
no user is ever in.

That is worse than covering a rollback path, and it means the answer to "is this coverage worth
keeping?" is **no, not in this form**. The fix improves the product whether or not the flag ever
retires:

- The **gating logic** is already safe: `plan-gating.test.ts` unit-tests `derivePlanGating({ penManaged: false, … })`
  as a pure function taking a boolean as **data**, not through the env module. It survives the flag's
  death for free. This is the pattern to copy.
- The **end-to-end proof** needs re-hosting, not deleting: convert the six specs to acquire the pen.
  That is a slice of its own, landed and green in the default world for a release **before** the flag
  is deleted — never coupled to a retirement date, because that coupling is exactly what made batch 1
  fail.
- **Do not manufacture unit-level flag-off suites as substitutes.** That would be producing the
  folklore D6 exists to end.

### D6 — Fix the gate before it fails for the wrong reason

`check-flags.mjs` assertion 4 matches `'true'` and `'false'` identically:

```js
/(VITE_[A-Z0-9_]+)\s*:\s*'(?:true|false)'/g;
```

Measured across the configs: **135 `'true'` pins across 39 flags**, and **10 flags** pinned
`'false'`. A `'true'` pin on an already-default-on flag asserts nothing and costs one line to delete;
a `'false'` pin is a harness and a conversion. The gate cannot tell them apart, so **batch 2 would
have failed on `VITE_CANVAS_TOOLBAR`'s no-op pins before anyone reached the layout deletion that is
the actual work.** ADR-0084 D4a's `weight = files + 3 × pins` inherits the same error and inverts the
cost.

Split them. Verify red first against a redundant `'true'` pin.

The same script's docblock says "it reports 22 configs". There are **32**. Corrected in passing, and
noted as the ADR-0076 Class 1 shape appearing inside the gate written to prevent drift.

### D7 — What the evidence says about flag-off suites, stated because it is uncomfortable

The test review searched every ADR and ~19 enablement-gate retrospectives — documents which
exhaustively list every defect they found — for a case of a **unit-level** flag-off parity suite
catching a regression during unrelated work.

It found **one**: ADR-0070's sub-day parity test, which caught a real defect (the table read-out
re-deriving a day count and printing a four-hour lag as `+1d`). Every other documented catch in this
codebase's history is credited to a flag-**on** journey or a specialist review.

In a repository this compulsively self-documenting about its own defects, that absence is evidence.
It does not mean the suites are worthless — it means they are **not** the safety net the estate is
being kept for, and the honest place to spend that effort is the flag-on journey, which is where the
catches actually come from.

Roughly **17 flags have no off-branch test at all, at any level.** For those, "retiring deletes the
parity suite" describes deleting nothing.

## Options rejected

- **Keep all 57 (the product owner's opening position).** Right about the ~28 guards, wrong about the
  two alternative surfaces — one of which has already shipped a defect. Keeping is not free where the
  branch is a second screen.
- **Retire all 57 on the calendar (ADR-0084 as written).** Sorts by the wrong property, would fail its
  own gate on no-op pins, and would delete the base journey's editing coverage before a replacement
  exists.
- **Make the flags runtime-injectable** — a `window.__SP_FLAGS__` served by the same nginx `envsubst`
  template `CSP_*` already uses. This is a real capability and would make the rollback framing true.
  Rejected for now: it buys a new configuration and drift surface for a lever the product owner has
  said they do not intend to use. **Named rather than dismissed** — if an operator kill-switch is ever
  wanted, this is the shape, and it is its own ADR.
- **Add unit-level flag-off suites for Class C before retiring.** Manufacturing the evidence D7 says
  does not exist.

## Consequences

- **The register stops being a queue and becomes a classification.** A flag added tomorrow is
  classified by the same rule rather than by whoever is reviewing.
- **Two gates replace one.** Every flag carries a class; a Class B flag that _grows_ a
  component-selecting ternary fails CI, because promotion to Class A is a decision somebody makes and
  not a drift. Class A is capped at three.
- **`keep` gets its first occupants.** ADR-0084 built the field and never used it; ~28 flags take it
  with one shared reason.
- **The blast-radius accounting is corrected** for three flags the register under-stated, the largest
  being `VITE_CANVAS_WORKSPACE` at seven configs with no note.
- **Nothing about the running application changes.** Every flag is already on and unreachable; this
  decision is about which code paths exist for developers to maintain.

## What this ADR does not do

It does not retire any flag by itself, does not touch the CPM engine, and adds no migration.
`VITE_CANVAS_TOOLBAR`'s retirement is the first slice under D3 and lands as its own revertible
commit, gated on `scripts/e2e-local.sh web:workspace` — batch 1's failure was invisible to every unit
suite.
