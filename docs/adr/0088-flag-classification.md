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

**Two axes, not one enum — and the first draft got this wrong in a way that mattered.** It offered
Class A / B / C as a partition. They are not disjoint: **both** Class A flags are also pinned off by
a Playwright config, so the two classes that matter most overlapped completely and the enum could
express neither. The architecture review caught it. The axes are independent because the questions
are:

**Axis 1 — branch shape. Mandatory, computed, and it partitions the register.**

- **Class A — alternative surface.** The flag's value decides which of two **different components**
  is returned. This is the "second product maintained forever" ADR-0084 describes, and for these
  flags the description is exactly right. **Five flags** — and the first draft of this ADR said
  two, which is the correction recorded below.
- **Class B — guard.** Everything else: `&&`, a conditional spread, a prop, a string ternary. Its
  production cost is one line. **These do not retire.** **Fifty-two flags.**

5 + 52 = 57, and `check:flags` asserts that sum. **There is no third bucket and no default**, because
the first draft's "roughly 28 / roughly 10 / roughly 17" left seventeen flags unclassified — and an
unclassified residue is precisely what ADR-0073 C3.4 deleted `PENDING_COVERAGE` for: _"the one census
reason that was a queue rather than a decision"_, replaced by an assertion that every reason is a
decision somebody made. Same rule here.

**Why "two different components" and not "lines of code behind the flag".** The cost is not volume;
it is **two implementations of one surface that can drift**. `{FLAG && <BigThing/>}` guarding four
hundred lines is cheap, because absence cannot drift — there is nothing to keep in step. ADR-0080's
shipped defect was drift between two implementations of one workspace. Stated so a later reader does
not "improve" this into a line-count threshold.

**Axis 2 — harness. Derived by script from the configs, never hand-maintained.** Which
`playwright*.config.ts` files pin this flag `'false'`. **Ten flags** carry one. This is orthogonal to
branch shape: a Class A flag may be harnessed (both are), and so may a Class B flag
(`VITE_PLAN_EDIT_LOCK`, `VITE_TSLD_EDITING`). A harnessed flag's retirement is governed by D5
whatever its branch shape — **replace or retire the coverage first, in the same commit**, never on a
deadline.

**Class A is derived by a script, not by a reviewer's reading**, or it becomes the prose ADR-0058
exists to distrust — and this clause went through **four** versions, three of them wrong, which is
the part worth keeping:

1. **"the flag appears in a ternary"** — matches **48 of 57**. Useless.
2. **"two different capitalised arms in a `.tsx`"** — matches two flags, and the **wrong** two.
3. **"a `return` whose arms are JSX roots"** — finds the two an architect had identified by reading,
   so the ADR was written claiming the rule was "verified against this codebase". A reviewer then
   found `VITE_ACTIVITY_EDITOR_TABS` **by reading**, minutes later: it branches _inside_ JSX
   (`{FLAG ? (<A/>) : (<B/>)}`), and anchoring on `return` missed it.
4. **`scripts/detect-alternative-surfaces.mjs`** — finds `FLAG ?`, then scans forward **balancing
   brackets** to the `:` belonging to that ternary and asks whether both arms open with a JSX
   element. It anchors on nothing around the ternary, because anchoring is what produced 1–3.

Version 4 finds **five**, and the two extra beyond the reviewer's are real by the drift test above:

| Flag                         | Selects                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `VITE_CANVAS_TOOLBAR`        | `<ToolbarPlanWorkspace>` vs `<Adr0030PlanWorkspace>` (`plan-workspace.tsx:70`)        |
| `VITE_CANVAS_WORKSPACE`      | `<PlanWorkspace>` vs `<LegacyPlanLayout>` (`plan-detail.tsx:112`)                     |
| `VITE_ACTIVITY_EDITOR_TABS`  | `<ActivityEditorDialog>` vs the legacy dialog trio (`activity-crud-dialogs.tsx:143`)  |
| `VITE_CALENDAR_SHIFT_EDITOR` | `<WeeklyShiftEditor>` vs the legacy weekday checkboxes (`CalendarFormDialog.tsx:467`) |
| `VITE_LIBRARY_SCOPING`       | `<Combobox>` vs `<Select>`, in **five** pickers (+ one guard — see below)             |

> _Corrected 2026-08-10._ This row said **four** pickers. The true shape is **five two-arm selection
> sites** — `ActivityFormDialog.tsx:551`, `ActivityCalendarField.tsx:98`, `PlanCalendarPicker.tsx:146`,
> `ResourceFormDialog.tsx:362`, `ActivityResourcesPanel.tsx:367` — **plus one guard-only site**,
> `ResourceFormDialog.tsx:318`, whose flag-off branch is `: null`. That last one renders **no control
> at all** flag-off, which is this decision's own **Class B guard** shape rather than a selection, so
> counting it as a sixth picker would be wrong in the other direction.
>
> The figure was not a clerical slip: it was **the detector's output**. `detect-alternative-surfaces.mjs`
> structurally cannot see `:318` (its ternary wraps a `<div>`, so neither arm opens with a JSX element
> by its test) or `:551` (an intervening comment). The consequence outranks the count — **assertion 3b
> does not backstop those two sites**, so the safety net when this flag retires is deleting the
> constant from `env.ts`, which converts every missed reference into a typecheck error. The detector
> remains a tripwire, never the classifier, exactly as D2 says.

**`VITE_ACTIVITY_EDITOR_TABS` is arguably the worst case in the estate**, and neither the ADR's
author nor the architecture review found it. Its flag-off branch is the pre-ADR-0060 dialog trio, and
**at least nine unrelated features have had to add a case to both** the legacy monolith and the
tabbed editor to keep them byte-identical — `ActivityFormDialog.{calendar,advanced-constraints,cost-accrual,duration-types,earned-value,inter-project-dates,levelling,scope,sub-day,activity-types}.test.tsx`.
That is the "second product maintained forever" with nine receipts.

> _Corrected 2026-08-10._ **The paragraph above is true about the codebase and false about the flag**,
> which is a more useful mistake than a wrong number. `ActivityEditorDialog.tsx:154` states in its own
> docblock that "this editor is **edit-only**; creation stays with `ActivityFormDialog`", and
> `CreateActivityButton.tsx` renders `ActivityFormDialog` with **no flag reference anywhere in the
> file**. So retiring this flag deletes three mount sites and leaves the legacy monolith alive as the
> **create** surface, carrying every field those nine features added — and the nine suites are
> **flag-unaware** (0 of 11 `ActivityFormDialog.*.test.tsx` files reference the constant), so they
> would not move either. The nine receipts are real; they are receipts for **create and edit being two
> different components** (an ADR-0060 decision), not for this flag. Retiring it collects none of the
> payoff this paragraph promises, which is why the batch-2 retirement chose other subjects. Unifying
> the two dialogs is the work that would actually collect it.

**The ADR said "two", and the honest number is five.** It is recorded rather than quietly amended,
because a document that asserts a computed count and gets it wrong is the exact failure this decision
is built on — and because the correction only exists thanks to a reviewer reading the code after the
ADR claimed the reading was done.

**But the detector is not the classifier, and that distinction is load-bearing.** The regex would
miss a Class A flag written as `const Body = FLAG ? A : B; return <Body/>`, as early returns in two
functions, or as `...(FLAG ? [routeA] : [routeB])` in the router. A gate that under-detects **fails
silently and conceals its own failure**: the cap never fires, nobody gets a red build, and D3's
central protection becomes decoration whose symptom is silence.

So the design is `check:claims`'s (ADR-0076), which has the same shape — a curated register, and a
script that fails loud on anything unregistered:

- The **curated Class A list in `flag-retirement.json` is authoritative**, and the cap is evaluated
  against it.
- The assertion is **`detected ⊆ curated`**. A flag outside the list that grows a returned-JSX-root
  ternary fails CI — the Class-B-becomes-Class-A tripwire.
- **The converse is never asserted.** A human-declared Class A flag written in an undetectable shape
  is legitimate, and `curated ⊆ detected` would fail it. Under-detection makes superset the only
  sound direction.

**This is the weak clause, and it is labelled as one** (the ADR-0076 §19.10 pattern). It catches
drift and omission. It **cannot** catch someone classifying a genuine Class A flag as Class B —
that requires a written false statement in a reviewed file rather than an oversight, and no gate
closes it. Said plainly rather than implied, because ADR-0072 described `ENGINE_DERIVED` as a gate
when it was a rule and ADR-0087 had to correct it.

### D3 — Class A retires on merit and on epic-touch, with a standing cap

No dates. A Class A flag retires when an epic next touches that surface — ADR-0078's
extract-when-touched rule, which has the property a calendar lacks: **the person deleting the branch
is the person who just paid for it.**

And a **cap at the measured count, which ratchets down.** Today that is **five**. Adding a _sixth_
alternative surface fails CI, which forces the conversation at the moment it is cheap rather than
eighteen months later.
That is ADR-0058's ratchet shape aimed at the thing that actually hurts: silent on the one-line
guard, loud on the second product.

**The measured count, and the reason is ADR-0058's own.** That decision set the coverage floors at
the **measured** value (API 74% / web 87%) rather than the aspirational 80%, because a gate that
fails on day one gets deleted rather than fixed. The first draft proposed three, then two — both
chosen before the detector was written, and both **below** the real count, so either would have
failed immediately on five perfectly ordinary flags. That is the aspirational-80% mistake twice in
one clause, and it is the second thing the detector corrected.

The cap is **re-set to the measured count after each Class A retirement** and never raised without an
ADR. `VITE_CANVAS_TOOLBAR` retiring takes it to four. Failing this gate is not a prohibition — it is
a required register edit with a written reason, which is what the cap is for.

### D3a — A Class A flag may be deferred, but only to an event somebody named

_Added 2026-08-10, with the batch-2 retirement._

D3 says Class A retires **on epic-touch**. Two of the four survivors have no epic touching them, and
both still sit on batch dates the gate enforces — so `check:flags` would go red on a date nobody
chose, for work deliberately not being done. A red build for a decision that was made correctly is
how a gate gets argued away.

**The obvious remedy is wrong.** `keep` already suspends the date, and reaching for it here would be
a **written false statement**: `keep` means "Class B, guard-only, never retires", and applying it to
an alternative surface corrupts the one classification this ADR exists to defend. It would also
launder the estate's two most expensive flags into the population declared permanently exempt.

So a `deferredUntil` field, **bounded by construction**, because an undated gate-honoured opt-out for
a Class A flag _is_ the escape hatch this decision set out to remove:

- a **trigger from a closed vocabulary** (`deferralTriggers` in the register) — so adding a reason is
  a decision made in a diff, not a sentence invented on the day a date passes;
- a **named `docs/TECH_DEBT.md` row**, because a deferral nobody can find is a deletion with extra
  steps;
- a **written reason**, and the gate rejects a bare date, a free-text trigger or a missing debt row.

**What a deferred parent's date means for a child.** Assertion 5 compares batch dues literally, so
once a parent is deferred its `due` stops being a retirement date while still bounding its children.
`CANVAS_WORKSPACE → CANVAS_AUTHORING → SCHEDULING_MODES` is a live chain of exactly this shape. The
rule is unchanged and the reason is worth stating: **a child may still not retire before its parent**,
and a deferred parent simply cannot retire yet — so the bound is stricter, never looser, and no child
is silently released by its parent's deferral.

`"retirement in flight"` is in the vocabulary from the start, so a retirement that slips past its own
batch date has a fitting value already written down rather than one improvised under time pressure.

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

> **`keep` is a Class B claim and nothing else** (added with D3a, 2026-08-10). It asserts "guard-only;
> no second product to maintain", which is false of every Class A flag. A Class A flag that needs to
> outlive its batch date takes **`deferredUntil`** instead — a different field because it is a
> different claim, and `check:flags` rejects a flag carrying both. The register's vocabulary is
> therefore `class` (what shape it is), `keep` (Class B, permanent) and `deferredUntil` (Class A, an
> event that will happen).

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
  That is a slice of its own, **decoupled from the flag's fate entirely** — not merely from its
  retirement date.

  The test review caught why that stronger wording is needed. D4 keeps `VITE_PLAN_EDIT_LOCK` and
  `VITE_TSLD_EDITING` **permanently**, so "convert the specs before the flag is deleted" is a null
  commitment: if the flag never retires, the condition never fires, and the base journey goes on
  proving role-only editing in an impossible configuration forever. That is ADR-0084 D1's own
  complaint — _an undated intention rots_ — reproduced inside this ADR's remediation. So it takes a
  **`docs/TECH_DEBT.md` row with its own trigger**, owned independently of whether either flag is
  ever retired.

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
  not a drift. Class A is capped **at the measured count, which ratchets down after each
  retirement** — the rule D3 states, not a literal.

  > _Corrected 2026-08-10._ This line read "capped at three" — one of the two draft figures D3
  > explicitly records **rejecting** as the aspirational-80% mistake, chosen before the detector
  > existed and below the real count. The ADR therefore contradicted itself, and `CLAUDE.md`
  > propagated the wrong half. The shipped gate was right throughout, which is the argument for
  > gates: `check-flags.mjs` read `classACap` from the register and never read this sentence. The
  > literal is gone rather than updated, because a number restated in prose is a number that goes
  > stale again at the next retirement (ADR-0073 C4).

- **`keep` gets its first occupants.** ADR-0084 built the field and never used it; ~28 flags take it
  with one shared reason.
- **The blast-radius accounting is corrected** for three flags the register under-stated, the largest
  being `VITE_CANVAS_WORKSPACE` at seven configs with no note.
- **Nothing about the running application changes.** Every flag is already on and unreachable; this
  decision is about which code paths exist for developers to maintain.

## What this ADR does not do

It does not retire any flag by itself, does not touch the CPM engine, and adds no migration.

`VITE_CANVAS_TOOLBAR`'s retirement is the first slice under D3 and lands as its own revertible
commit, gated on **`scripts/e2e-local.sh web:toolbar`** — batch 1's failure was invisible to every
unit suite.

**That gate said `web:workspace` in the first draft, and it would have reproduced batch 1 exactly.**
`playwright.workspace.config.ts` pins `VITE_CANVAS_TOOLBAR: 'false'` and drives
`e2e-workspace/workspace.spec.ts`, which exists to exercise `Adr0030PlanWorkspace` — **the component
the retirement deletes**. Running it after the retirement means its specs click controls that no
longer exist, which is batch 1 verbatim, proposed as the safety gate of the ADR written to prevent
batch 1. `playwright.toolbar.config.ts` pins the flag `'true'`, so it is the harness for the world
that survives, and it is the correct gate. `playwright.workspace.config.ts` and `e2e-workspace/` are
**deleted in the same commit as their subject** (ADR-0084 D5) — after confirming
`e2e-toolbar/toolbar.spec.ts` covers the drag-resizer gesture, and porting that one assertion if it
does not.
