# ADR-0095 — The Gantt becomes a working surface

- **Status:** Accepted (M0–M4 + M5's row menu, bar labels and constraint badge landed 2026-08-17;
  the rest of M5 deferred and named below)
- **Date:** 2026-08-17
- **Supersedes:** nothing
- **Amends:** ADR-0059 (its §4 "read-only, no dependency arrows" first ship, and its §2 shared time
  axis extended to the inverse direction), ADR-0093 (discharges the promise it left outstanding)
- **Builds on:** ADR-0022/0023/0033 (recalculation, dates, scheduling modes), ADR-0028 (the pen),
  ADR-0038 (WBS summaries), ADR-0048 (undo), ADR-0060 (per-scope save), ADR-0068/0070 (the
  per-calendar day factor and sub-day durations), ADR-0082/0083 (shade with a reason; read-only, not
  disabled), ADR-0092 (the canvas dock), ADR-0094 (the conflict remedy on the object)
- **Spec:** [`docs/specs/gantt-editing/`](../specs/gantt-editing/)

---

## Context

ADR-0059 shipped the Gantt because **the people a planner reports to do not read logic diagrams**.
It shipped read-only by design, with no dependency arrows, and deferred editing as its M5.

Two things then made that deferral cost more than it looked. ADR-0093 took `Report progress` off the
command surface on the rule that _an object action belongs on the object_ — and its replacement, the
ADR-0092 canvas dock, is canvas-only. The product owner accepted that on 2026-08-13 **explicitly on
the basis that the Gantt would pick it up**. So the Gantt had a selection and nothing to do with it,
and a Contributor working there reached progress only through the activities table's row menu.

And `PROJECT_BRIEF.md` §8 words the Must-have as _"read-primary; **edit supported**"_. CLAUDE.md's
banner claimed ADR-0059 closed it and was corrected in place: the brief's own wording was not met.

## Decision

### D1 — The object-action bar is the dock's, called twice, not built twice

`buildSelectionBarContext` is extracted and both hosts **call** it. `SelectionBarContext.canvas` is
`SelectionCanvasContext | null`, and the two canvas-only items gate on `canvas !== null` — so a Gantt
host passes `null` and zoom-to-selection and isolate are **absent**, not shaded: they are things the
object cannot do in this projection, not things this reader may not do (ADR-0082's omit branch).

`Add note` is **retired from the Gantt**. It was the only route a Contributor had to progress there —
a button labelled "Add note" plus a tab change — which is the discoverability failure this epic
exists to fix. Leaving it beside the correctly-labelled route would be a third entry point rather
than a replacement: ADR-0093's own defect reproduced inside the milestone meant to discharge it.

### D2 — One resolver decides which dates a bar is drawn from, for every view and every read-out

Found by reading, not from a report (`docs/TECH_DEBT.md` #135). `layout/bar-geometry.ts` read
`earlyStart`/`earlyFinish` unconditionally while the canvas was handed
`barDateSourceFor(mode, lateOverlay)` — so in a **VISUAL** plan the chart and the diagram disagreed
about every hand-placed bar. Each view was internally consistent, which is why nobody reported it.

**The fix's second half is the more interesting one.** Threading a source through `barGeometry`
closed the bars and left four more sites reading the early dates unconditionally: the grid's **text
cells** (the accessible carrier — `grid-columns.ts`'s own docblock says the bar is "decorative
reinforcement"), the **sort** (ordering by a column the grid was not showing), `rowsDateSpan` (the
chart's framed extent, so a pushed bar fell **outside its own chart**), and a **verbatim duplicate**
of the resolver in `wbs-groups.ts`. `rowsDateSpan` was internally inconsistent — its bucket branch
had been made source-aware and the activity branch three lines below had not.

All five now go through `lib/bar-dates.ts`. It lives in `lib/` because a module both views import
belongs to neither.

### D3 — A grid cell is read-only, never disabled, and its scope is per cell

Per-cell write scope is ADR-0060's ruling at cell granularity, not a new idea: a row spans a
definition write (name, duration, the dates — pen-gated) and a progress write (`percentComplete` —
deliberately role-only, Q-C). A grid-wide "can edit" would have to pick one rule and would remove a
Contributor's ability to report progress while a Planner holds the pen.

The gate **resolves** the editor's own `ScopeGate` rather than rebuilding it, with the identity
assertion derived from that object's **own keys** so a field added later cannot silently fail to
reach the grid. Permission is checked **last**, so a reason about the OBJECT — a summary's rolled-up
dates, a milestone's absent duration — is never masked by one about the reader.

Shut cells carry `aria-readonly` plus an `sr-only` reason linked by `aria-describedby`. ADR-0083's
finding runs the opposite way to the obvious one: making a gated field **readable** removes the
1.4.3 exemption `disabled:opacity-50` relies on. So the treatment dims the **chrome** and never the
**value**, and the `['--muted','--foreground']` pair went into `token-contrast.test.ts` **before**
the CSS existed.

**On an uncalculated plan the grid renders**, with name and duration editable and only the dates
read-only carrying "Recalculate the plan to set dates". The branch previously returned a sentence and
no grid, which made every cell unreachable on precisely the plan a planner is most likely to be
typing into. The first draft made duration read-only too; a duration is an **input**, not a rollup.

### D4 — `Alt+←/→` moves a bar; the bare arrows stay disclosure

The plan said bare arrows until the accessibility re-review. They are **already bound** to treegrid
disclosure in the same handler, and the canvas precedent the plan cited (`TsldPanel.tsx:1848`) uses
**Alt** for exactly this. The keyboard equivalent exists at all because a pointer-only capability is
a WCAG 2.1.1 failure — and it landed **before** the pointer gesture, so there was no window in which
the feature existed for some planners and not others.

The pointer drag keeps its live position in a **ref** and publishes at most once per frame; Escape
cancels capture-phase (while a drag is live, Escape belongs to the drag); a drag that never moved is
a **click**, not a write; and the frame is cancelled on unmount, because a row can be virtualized
away mid-drag and the release handler is then not guaranteed to run.

### D5 — Arrows: ADR-0059 §4's objection is answered by the **geometry**, and that is a test

ADR-0059 §4 says arrows "would drag the rejected substrate back in through the side door". That
phrase is about **routing** — obstacle avoidance and corridor bundling (ADR-0065) — and routing cost
is independent of the render target, so answering "SVG, not canvas" does not by itself answer it.
**Neither that ADR nor this epic's first spec said so.**

What answers it: TSLD bars **share lanes**, so a link there must be routed around bars between its
endpoints. Gantt rows are **one bar per row, vertically separated**, so a link is an elbow through
whitespace. `link-paths.structural.test.ts` asserts no obstacle search and no canvas painter, with a
non-empty-corpus assertion so it cannot pass over nothing.

Culling is **at least one endpoint in the window**, measured rather than argued (M0-T1 R5): on a
2,160-activity / 3,200-link programme the adopted rule is sort-independent at p95 71–74 while the
rejected span-crossing rule reaches 88 p95 / 93 max. The cap **always reports its withheld count**;
a silent truncation reads as "that is all the links there are".

### D6 — The row menu is the dock's roster, and the gate can now see it

ADR-0094 recorded a hole in ADR-0093's duplication gate in writing: it compares **two** registries,
so a **third** copy is invisible to it. `GanttRowMenu` renders from `selectionActionItems`, and the
gate gains an assertion that the file names no action literally — matching on the labels the registry
owns, so a copy is caught by the strings it copied.

## Consequences

- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction. `engine-import.structural.test.ts` and `check:frontend-only` hold
  both halves of that claim mechanically.
- **No feature flag** (the product owner's Q4 choice). Every milestone reached the auto-pulling host
  as it merged, which raises the bar on the flag-on journey rather than lowering it —
  `apps/web/e2e-gantt-editing/` landed with M1, the **first** user-facing milestone, per ADR-0081.
- **A gate written for this epic could never fire.** `check:frontend-only` opted in from CI with
  `contains(github.head_ref, 'gantt')`, and this repository has one long-lived agent branch whose
  name contains no "gantt" — ADR-0088's 135 no-op flag pins in a second costume, written the same
  week by the same hand that recorded them. The opt-in is now a declaration file the script reads.
- **`GRID_WIDTH` was a literal that disagreed with the columns**, and measuring before adding one
  found the consequence: **Float rendered 80 px on top of the chart**, its header overlapping the
  Timeline header, painted over the bars by the pinned block's own `z-10`. Derived now; re-measured
  overhang 0.

### D7 — The gate pass, and what five specialists found that a human read had not

Five reviews over the combined diff. **All five blocked**, on findings that had passed a human read
and, in three cases, the epic's own tests.

The largest is a **data-loss path**: arrow keys typed into an open cell bubbled to the treegrid
handler, so ArrowLeft toggled the row's disclosure instead of moving the caret and ArrowUp moved
focus to another row while the reducer still held the cell as `editing` — orphaning the typed text
silently, after which F2 on the new row overwrote it. The cell stopped Enter and Escape and not the
other six keys: ADR-0079's rule applied to two keys and not their neighbours, which is this
register's standing shape.

Next, the **row menu rendered every pen-gated action as live**. The registry expresses pen-gating as
a flag the `Toolbar` primitive resolves centrally; the menu read only `isEnabled`. It was found by
the **first test ever written against that component**, and `coverage.structural.test.ts`
structurally could not have demanded one — it matches labels the docked bar already drives, which is
the blind spot its own docblock names, realised for a whole surface.

Then the **print path, which was never wired**: `GanttPrintSurface` gained `barDateSource` and
`PrintGanttInput` did not, so the printed programme still drew VISUAL-mode bars from the early
columns — and the commit that introduced it claimed the source was threaded through the print
surface when only its signature was. ADR-0076 Class 3, inside the commit that fixed four other
instances of the same class.

And a **render-phase ref write the linter could not see**. `eslint-plugin-react-hooks` v7 carries
the React Compiler's analysis, but `GanttPanel` calls `useVirtualizer`, which that analysis reports
as an incompatible library and then bails out of the whole component for — so the rule that caught
the identical pattern in a sibling file gave no protection in the one file the tool cannot read. The
reviewer **reproduced** the blind spot in an isolated component rather than asserting it.

**Two reviewers were partly wrong, and that is recorded rather than dropped.** The performance gate
reported the React Compiler as "not running at all", reasoning from the build config; the analysis
does run, in the linter, and is what refused the ref write. Its narrower point holds and the
comments now say so: `babel-plugin-react-compiler` is not wired into the build, so nothing is
auto-memoized in the shipped bundle, and a stable callback reference would buy nothing today because
**nothing in `apps/web` is `React.memo`'d**. The UX gate's fourth finding — the keyboard-shortcuts
sheet is inert while the Gantt is on screen — is real and is left as debt rather than half-fixed:
that sheet documents canvas bindings, and the Gantt now has a set of its own, which is a milestone
rather than a patch.

The measured findings were folded as measured: three O(n) scans that ran per row and re-ran on every
keystroke are now `Map` lookups or deferred to the menu's own open. The pattern was already in the
same file — `rowIndexById`, three hundred lines above the call sites that did not use it.

### D8 — What is drawn beside a bar, and why it is one module

**Bar labels (B10f)** are the spec's "largest single legibility win in a **printed** programme", and
both P6 and Powerproject do it: a chart whose bars are anonymous sends the reader's eye back across
the page to the grid for every one. The **constraint badge** is the state behind the one-per-session
note — that note explains the _moment_ a constraint is written, and without a lasting mark a planner
returning next week cannot see which bars are pinned, which is exactly when it matters, because a
pinned bar is the one that will not move when the logic says it should.

They share a module because they occupy the same strip of chart and would otherwise be two
components competing for it. Withholding is by **available room**, not a zoom threshold: a threshold
is a second answer to "does this fit?" and goes stale the moment a font or a column width changes.
A badge survives when its label does not — a dense chart is precisely when somebody is hunting for
pinned bars. Both are `aria-hidden`: the cells already carry the name and the editor carries the
constraint, so these reinforce rather than duplicate, and the accessibility tree still holds exactly
one of each. On paper the badge prints **black**, so the glyph carries the meaning and colour carries
none — WCAG 1.4.1 holding by construction on the one surface where colour cannot be relied on.

### What this milestone did NOT ship — and what closed it afterwards

Recorded here rather than implied. M5 first shipped the **row menu (T3)**, **bar labels (T2)** and
the **constraint badge**, leaving the columns chooser (T1), Indent/Outdent (T4), Insert activity
(T5) and view memory (T6) unbuilt as `docs/TECH_DEBT.md` #136.

**All four landed on 2026-08-18**, with `apps/web/e2e-gantt-editing/view-state.spec.ts` driving them
against a real API. Four decisions from that work belong here rather than in a commit message:

- **Indent does not convert a task into a summary.** P6 and MS Project both indent by making the row
  above the parent, converting it on the way. This cannot: ADR-0038 makes "only a `WBS_SUMMARY` may
  be a parent" a service invariant, and a summary may never be a dependency endpoint — so the
  borrowed gesture would silently strip every link on the row above, or fail at the API citing an
  invariant the planner never invoked. Indent files the row under the nearest **existing** summary
  and says so plainly when there is none. A smaller capability, and an honest one.
- **Columns serialise as a HIDDEN list.** With a shown-list, anyone holding an old URL silently
  loses any column added later; a hidden-list degrades to showing it.
- **Grid width is deliberately not stored**, though T6 names it: the grid has no resize handle, so
  nothing can set it. Storing a value no control produces is state claiming a capability the surface
  does not have. It returns when the grid becomes resizable.
- **The collapse set is capped at 40 ids**, with the withheld count reported. Ids are 36 characters,
  and a truncated list half-restores a view while looking deliberate.

**The journey landed after the code, and that is the finding.** T1/T4/T6 shipped in three commits
with no flag-on journey — the gap ADR-0081 exists about, one epic after it was written. What the
journey then covered is exactly what the unit suites structurally could not: a reload crossing the
**real** router, where `docs/TECH_DEBT.md` #96 means a search param arrives as a number rather than
a string, and every screen test mocks `useSearch` and never crosses it.

`docs/TECH_DEBT.md` **#137** (the shortcuts sheet inert in this view) is closed in the same pass:
the sheet is renamed `PlanShortcutsHelp`, mounted once at the workspace above both views, and shows
the Gantt's own bindings. Two lists rather than one merged list — the views share key **names** and
not meanings, so Enter opens the logic editor on the canvas and commits a cell edit in the grid. The Gantt's **start-edge** resize is also deliberately absent (D4):
it carries a mode-dependent meaning, and shipping it without the mode statement the canvas has beside
it would leave a planner unable to tell which of two writes their drag just made.

The **keyboard-shortcuts sheet** does not open while the Gantt is on screen (`TsldShortcutsHelp` is
mounted inside `TsldPanel`, which is not rendered in that view) — a lit-but-inert control found by
the M6 ux gate and deliberately not patched, because this epic gave the Gantt a set of bindings that
sheet does not document.

`PROJECT_BRIEF.md` §8's "edit supported" is now **substantially** met and is not claimed closed —
the same care CLAUDE.md's banner had to be corrected into once already for this surface.
