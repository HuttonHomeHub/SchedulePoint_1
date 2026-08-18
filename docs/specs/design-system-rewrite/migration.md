# Migration — six landings, and what gets worse

> ~989 web source files consume these tokens. A `VITE_` flag is **not** a rollback for the operator
> and never has been (ADR-0088: Vite inlines `import.meta.env.VITE_*` at build time,
> `apps/web/Dockerfile` declares one `VITE_` build arg, `docker-publish.yml` passes none,
> `.dockerignore` strips `**/.env` from the build context). So the rollback here is a **commit
> boundary**, and the design's job is to make most of the landings byte-identical so that most of
> the rollbacks are free.

---

## 0. The ordering rule, and why each position is load-bearing

**Gates before values. Structure before values. Byte-identical before visible.**

That is ADR-0055 §8.1's argument — _"flipping the structure and the values together makes every
flag-off parity suite meaningless on the day it is most needed, and turns one reviewable diff into
two entangled ones"_ — applied to an epic that has no flag to hide behind.

| Landing                                          | Visual change                                 | Rollback              |
| ------------------------------------------------ | --------------------------------------------- | --------------------- |
| **L0** — gates, no CSS                           | none                                          | free                  |
| **L1** — the canvas becomes a scope              | **none, by construction**                     | free                  |
| **L2** — metric tokens frozen at shipped values  | **none except the Gantt row** (CQ-B, 32 → 28) | free                  |
| **L2b** — the control scale moves 40 → 36        | **yes, every control** — a measurement task   | revert a named commit |
| **L3** — the page vocabulary                     | yes                                           | revert a named range  |
| **L4** — values                                  | yes, per theme                                | revert a named commit |
| **L5** — the documents re-derived from the gates | none                                          | free                  |

**Two of these changed when the four critical questions were answered** (`README.md`), and both
changes cost the plan something it should not pretend it still has:

- **CQ-B (one rhythm, at 28)** means L2 is no longer byte-identical. The Gantt's row goes 32 → 28 on
  the day the token lands. It is one surface and one number, so L2 keeps its position; it does not
  keep its claim.
- **CQ-C (move to 36 in this epic)** adds **L2b**, which is the only landing in the plan whose
  deliverable is a set of measurements rather than a diff.

---

## L0 — the gates, and nothing else

**No CSS. No component. No route.** This is the milestone that makes every later one checkable.

- **L0-T1 — execute the arithmetic.** Every hand-computed figure in `diagnosis.md` §0.2 and §3.3 is
  re-derived by running the repository's own transform. This session had no shell; the numbers were
  computed by hand and the register punishes a claim that was never run (`CLAUDE.md` §19.10). If an
  executed figure disagrees, **the document is wrong and is corrected in place**, not quietly.
- **L0-T2 — the pair census** (`design.md` §8.1), including alpha-modified fills and the split-pair
  rule. Verified red by removing one existing pair from the assertion and confirming the census names
  it.
- **L0-T3 — the plot separation matrix** (`design.md` §8.2), **reporting** the fill-to-fill numbers
  rather than asserting them (CQ-D). It will print `1.27:1` for Light and `1.34:1` for Corporate on
  its first run, and those two numbers are the argument for L4.
- **L0-T4 — the closure** (`design.md` §1.5b) computed and **compared** to today's `REBOUND_NAMES`,
  reporting the difference. Expected output: `--destructive`, `--destructive-foreground`,
  `--destructive-hover`, `--secondary`, `--secondary-foreground`, and the three solid status triples.
  Reported in L0, asserted in L1.
- **L0-T5 — the rhythm ratchet** at its measured floor: **27 arbitrary sizing values** across
  `apps/web/src/**/*.tsx` today. Set at the floor, never at zero — ADR-0058's coverage-ratchet
  lesson, which exists because _"a gate that fails on day one gets deleted rather than fixed"_.

**Why L0 ships alone:** every one of its assertions is a statement about code that already exists.
If any of them is red, that is a finding about the shipped product, and it should be reported and
triaged on its own rather than inside a redesign that can be blamed for it.

---

## L1 — the canvas becomes a scope

**Byte-identical by construction**, and the construction is worth stating precisely because it is
what makes the largest structural change in the epic free to revert.

1. Declare a `--canvas-*` family whose 18 base values are **exactly the values those names resolve
   to today at `:root` / `.dark` / `.corporate`**, plus the `PLOT` pack at today's
   `--canvas-band` / `--canvas-grid-*` / `--canvas-nonworking-hatch` values.
2. Add `[data-surface='canvas']` and `'canvas'` to `SurfaceTone`.
3. Wrap the TSLD diagram container and the Gantt chart region in `<Surface tone="canvas">`.
4. Pass that element to `resolveTsldPalette`, `resolveWbsBandPalette`, `resolveLensPalette`,
   `resolveResourceStripPalette` — and **to `resolvePrintPalette`**, which is the one that will be
   forgotten, because it takes a root, clears `.dark`, and would otherwise keep resolving the page.
5. Apply the closure from L0-T4 as an assertion.

**Nothing moves, because every canvas value equals its page value on the day it lands.** The proof
is the existing paint parity suites plus the ADR-0078 S1 whole-scene golden log, which exists for
exactly this kind of change.

**The two things that can go wrong and their guards:**

- The palette resolves against an unmounted or out-of-scope element and silently returns page values.
  Guard + a test that asserts the resolved fill **differs** from the page fill when the two token
  values differ. Without that test the failure is invisible, because "page values" is today's
  behaviour.
- `resolvePrintPalette` is missed. A test asserts both resolvers read the same **scope**, not merely
  the same token names.

**Run `apps/web/scripts/measure-link-routing.mjs` before and after** and record both numbers
(`hard-surfaces.md` §1).

---

## L2 — metric tokens, frozen (except one)

Declare `--control-h-*`, `--row-h`, `--ruler-h`, `--lane-h`, `--lane-bar-h`, `--rule-w`,
`--gutter-*`, `--radius-plot`, `--tap-min` at **today's shipped numbers**, add `[data-density]` with
all three levels resolving to those same numbers, and re-express the primitives and the five module
constants in terms of them.

Four values genuinely disagree today and the freeze has to pick one each. Two are now answered and
two are not:

| token              | today                             | L2                                                           |
| ------------------ | --------------------------------- | ------------------------------------------------------------ |
| `--row-h`          | 28 tree / 32 Gantt / `py-2` table | **28** — CQ-B answered. **The Gantt moves; this is visible** |
| `--control-h-md`   | 40 shipped / 36 documented        | **40, frozen** — the move to 36 is CQ-C and is **L2b**       |
| `--ruler-h`        | 40 TSLD / 34 Gantt                | **unanswered** — stays per-surface until it is               |
| toolbar minor axis | 36 (`docs/TECH_DEBT.md` #127)     | 36, frozen                                                   |

**Where a value is unanswered the token stays per-surface until it is answered** — a `--ruler-h-tsld`
and a `--ruler-h-gantt` later collapsed is honest; picking one silently is not.

**So L2 is byte-identical apart from the Gantt row**, and that exception is stated rather than
absorbed: CQ-B's answer buys one rhythm across three surfaces and costs the plan its cleanest
rollback claim on one of them.

**Gate: `pnpm --filter @repo/web measure:toolbar` and `test:e2e:toolbar-fit` at 1646, before and
after, numbers recorded.** Four consecutive epics found their width expectation contradicted by their
own measurement; this one does not add a fifth by arithmetic. The Gantt row change also needs
`test:e2e:gantt` and `measure:gantt`, because virtualization is measured off that number
(`GanttPanel.tsx:420`).

Also here: `@media (pointer: coarse)` resolves `[data-density]` to `comfortable`, which is what makes
`docs/TECH_DEBT.md` #127 closable without adding 16 px to every desktop planner's band. That **is** a
visible change under a coarse pointer — so it is measured with the first-ever coarse-pointer sweep
(`docs/TECH_DEBT.md` #133) and, if the numbers are bad, deferred to L4 rather than shipped on hope.

---

## L2b — the control scale moves 40 → 36 (CQ-C)

**This is a measurement task, not a token edit**, and it is the only landing in the plan whose
deliverable is a set of numbers. It departs from this design's own default — which was to tokenise 40
and move later, precisely because ADR-0090 and ADR-0091 derive the command surface's band floors from
**measured** control widths and `e2e-toolbar-fit` asserts them. The answer is to move it now; the
rule that made the default cautious does not go away, it becomes the method.

**Why it goes here and not in L4.** It is the one value change that alters the _inputs_ to another
epic's measurements. Everything in L4 is colour and type, which no gate elsewhere derives a floor
from. Putting L2b immediately after the frozen tokens means the toolbar is re-measured **once**,
against a tree whose only other change is a no-op re-expression — so a regression has one candidate
cause rather than four.

### The six steps

1. **Change the value.** `--control-h-sm|md|lg` 36/40/44 → 32/36/40, and `Button`/`Input` follow the
   token. Nothing else moves in this commit.
2. **Re-run `pnpm --filter @repo/web measure:toolbar` at 1646** — the product owner's actual screen,
   and the width ADR-0091's retrospective records nobody having measured for two entire epics. 1920,
   1440, 1024 and 768 are swept too, but 1646 is the one the answer is judged on.
3. **Re-derive the band floors from what it reports.** `resolveLayoutMode`'s four floors (1536 /
   1280 / 1024 / 0, `docs/DESIGN_SYSTEM.md`) and `computeLadder`'s inputs come out of the new
   measurement. **Do not adjust them to make the existing gate pass** — that is tuning the instrument
   to the reading, and it is how a measured floor silently becomes a remembered one.
4. **Update `e2e-toolbar-fit`'s expectations to the measured values**, including the coarse-pointer
   assertions, which are deliberately written against the figures actually delivered
   (`docs/TECH_DEBT.md` #127).
5. **Run every journey.** All 33. ADR-0091's retrospective records three broken by a label change,
   each found by CI rather than locally, and the rule that replaced that judgement is that a layout
   change means running all of them. `scripts/e2e-local.sh web` now covers the base one, which is the
   suite that was previously unrunnable through the documented pre-push gate (ADR-0096).
6. **Measure and report the vertical gain rather than asserting one.** Re-run
   `apps/web/measure-toolbar/vertical-stack.spec.ts` at 1646 and record the bands against the
   2026-08-13 baseline: **shell chrome 192 (header 56, identity 45, row 1 45, row 2 44), above the
   canvas 249, canvas 558** (`workspace-chrome/m0-band-measurement.md` §2).

### What step 6 is likely to find, said before it is run

A 4 px control height does **not** necessarily buy 4 px of band. The command row's minor axis is
already 36 (`docs/TECH_DEBT.md` #127) and the row's height is set by `min-h-9` on the control, not by
`Button`'s default — so **the two toolbar rows may not move at all**, and the gain may land entirely
in the tables, the forms, the Explorer and the dialogs.

That is a legitimate outcome, it is not the outcome the change is being made for, and it is therefore
the one most worth measuring. **If the vertical gain is small, that is the finding and it is reported
as one** — four consecutive epics here have had a headline width or height number contradicted by
their own measurement (ADR-0091 D4, ADR-0092 M4, ADR-0093, ADR-0094 M0-T1), and in two of those the
correction was more useful than the change.

### Rollback

One commit. It is the largest single visual change in the epic — **every control in the product, in
all three themes** — and it deliberately lands alone so that reverting it does not take the token
architecture with it.

---

## L3 — the page vocabulary

The first landing with a visible change, and the one the organisation-landing epic is waiting for.

`PageContainer`, `PageHeader`, `SectionCard`, `EmptyState`, `Skeleton`, `ListRow`; `CardTitle` gains
`level`; `DataTable` gains `numeric` + sticky header + `Skeleton` rows; **12 route files migrate**;
`staff.tsx:117-118`'s written workaround is deleted.

**Why the migration is safe, and it is not because it is small.** Every existing suite queries by
**role and accessible name** — which is exactly what a frame migration preserves. That is the
ADR-0062 extraction standard, whose proof was that _"every pre-existing suite passed unchanged"_.
Where a suite fails, it is asserting a _structure_ rather than a _contract_, and that is worth
knowing.

**No public component API changes**, which is what makes reverting L3 a revert rather than a
rewrite (the ADR-0078 barrel-preserving argument).

**All 33 Playwright journeys are run, not reasoned about.** None of them sets a theme, so every one
paints in whatever the default is and every one sees this DOM change. ADR-0091's retrospective
records three journeys breaking across one layout change, each found by CI rather than the author,
and the rule that replaced that judgement: after any label or layout change, run every journey.

---

## L4 — values

**One theme per commit, and one decision per commit.** This is where the design becomes visible and
where the product owner's judgement is the acceptance test.

In order:

1. **The plot values** — the criticality triple re-separated so the L0-T3 report clears the **≥ 1.5:1**
   floor (CQ-D, answered), in all three themes, in both canvas flag states, **and in the print
   palette**. The gate is promoted from reporting to asserting **in this commit**, with the values
   that satisfy it. Note what the floor is and is not: a **house number** for "do these read as
   different at a glance", not a WCAG one — the solid-versus-dashed criticality outline carries 1.4.1,
   on screen and on paper (`palette.ts:135`).
2. **The diagram ground** (CQ-A, answered: yes) — Light and Dark gain a quiet working surface distinct
   from the page, joining Corporate's, which until now was flagged.
3. **The accent placement** (`design.md` §2.2) — the current nav item, the selected row, the active
   mode. `ACCENT_ROLES` lands with it.
4. **The type ramp's values** — `--text-page` finally has a size, and it is the first time a page
   title has been visually distinct from a section heading.
5. **Elevation** (`design.md` §4.2) — ten call sites, and the Dark-theme rule written down.

**Density is not in this list any more.** CQ-C moved it to **L2b**, ahead of L3, because it is the
one value change that alters another epic's measured inputs and it must be re-measured against a tree
with nothing else moving in it.

**Corporate's promotion to the default theme is the sibling epic's**, not this one's, and the
ordering between them is a product decision. The argument for it going **first** is strong and is
that epic's to make: the product owner cannot judge design work on a theme they are not looking at.

---

## L5 — the documents, re-derived

`docs/DESIGN_SYSTEM.md` is currently wrong about the type scale (`text-3xl`, unused), the control
scale (36 vs 40), the table primitive (five features it does not have), the scope count (§230 says
three, §267 says five) and the family size (§246 says 17, the gate says 18). Every one of those is
**re-derived from a gate or from the code**, not from another document — the failure this repository
has recorded more than any other.

`docs/COMPONENT_LIBRARY.md` gains the six new primitives. `docs/FRONTEND_ARCHITECTURE.md`'s theme
section gains the density axis and the canvas scope. `CLAUDE.md` §16 and `docs/adr/README.md` gain
ADR-0097 — **in the same commit as the ADR file**, because `scripts/check-counts.mjs:55` re-derives
the count from `docs/adr/`.

---

## What gets worse

Said here rather than discovered.

1. **`globals.css` gets substantially longer.** Six base families × 18, plus packs, plus the metric
   layers, plus `--page-*`, in three theme blocks. Today it is 1,114 lines. Editing one colour means
   editing it in more places, and the only thing standing between that and drift is the gates. **This
   is the epic's largest ongoing cost and it does not go away.**
2. **Light and Dark change visibly, and they were called "secondary".** The page frame, the type
   ramp, the row rhythm and the diagram ground are shared structure, so an epic commissioned to make
   Corporate look designed changes the two themes the product owner called secondary. That is CQ-3(a)
   in the sibling spec, inherited here, and it should be approved rather than discovered.
3. **Between L2 and L4 the product is in a half-state.** Metric tokens exist and carry today's
   disagreeing values; the page vocabulary exists and the values have not been designed. It will look
   slightly _more_ inconsistent for a period — a real page title next to a card title that has not
   moved yet — and that is the price of not flipping structure and values together.
4. **The plot separation gate is red until L4.** It ships **reporting** for exactly that reason
   (CQ-D), and a reported number that everyone learns to scroll past is a real risk. Mitigation: L4-1
   is the first value commit, so the window is short and named.
   4a. **L2 is no longer byte-identical** (CQ-B). The Gantt's row goes 32 → 28 with the token, so one
   surface loses the free rollback the landing was designed to have. One number, one surface, stated
   rather than absorbed — and it needs `test:e2e:gantt` and `measure:gantt`, because the virtualizer
   is measured off it (`GanttPanel.tsx:420`).
   4b. **L2b is the largest single visual change in the epic** (CQ-C): every control in the product, in
   all three themes, in one commit. It departs from this design's own default, and the default's
   reason — that ADR-0090/0091 derive band floors from measured control widths — does not go away, it
   becomes the method. **The specific risk is step 3 of L2b**: adjusting a band floor to make the
   existing gate pass instead of re-deriving it from the new measurement. That would convert a
   measured floor into a remembered one silently, and nothing downstream would catch it.
   4c. **The vertical gain L2b is being made for may not materialise.** The command row's minor axis is
   already 36, so the two toolbar rows may not move at all and the height may come back entirely in
   tables, forms and dialogs. That is why step 6 measures and reports rather than asserting — and if
   the gain is small, **that is the finding**, not a failure of the milestone.
5. **Density-by-surface means a control's height depends on where it lands.** That is the opposite of
   the surface-scope property that no descendant learns where it is — and the mitigation is only that
   it is inherited CSS rather than a prop, so nobody has to _thread_ it. Somebody will still be
   surprised by it once.
6. **The canvas scope makes `resolveTsldPalette`'s root load-bearing.** A function four callers share
   grows a way to be silently wrong that it did not have before, on the surface with the least
   observability in the product.
7. **The closure rule will govern pairs the product never renders** (`design.md` §1.5, blind spot).
   Three lines of CSS each, and the right direction to be wrong in — but it is more CSS for pairs
   nobody paints.
8. **The scope count is now the thing to defend.** Six families is affordable; the seventh is where
   this becomes unmaintainable, and the only thing preventing it is a written bar and a reviewer who
   applies it.

---

## What this epic must not do

- **Answer `docs/TECH_DEBT.md` #75.** It must leave the canvas budget _measurable_ and re-run the
  harness. It must not quietly become the epic that sets a new number.
- **Change the toolbar ladder's _arithmetic_.** ADR-0090/0091 own `resolveLayoutMode`,
  `computeLadder`, the hysteresis, the `⋯` costing and the "a shrink-to-fit row must never demote"
  and "the band width may never be an input to a fit decision" invariants. **L2b re-derives the
  ladder's _inputs_ — the band floors — from a new measurement, and that is the only thing it may
  touch.** The distinction is the whole safety argument: an input re-derived from a measurement is
  the ladder working; an input adjusted so the existing gate passes is the ladder being defeated.
- **Reopen ADR-0061's form vocabulary, ADR-0082's menu rule or ADR-0083's field rule.** All three are
  recent, gated and correct.
- **Touch `brand` or `auth` values.** ADR-0077's theme-invariance is a decision, and `globals.css`
  says so in capitals for a reason.
- **Add a component library, a chart library, a toaster or a command palette.** Each is an ADR of its
  own, and arriving under cover of a token rewrite is how a design system becomes a framework.
