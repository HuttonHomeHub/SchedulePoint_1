# Architecture review — the workspace foot and the command deck

**Reviewer:** ui-architect, as the last architectural read before this ships. **Date:** 2026-08-27.
**Against:** the working tree on `claude/schedulepoint-project-setup-naacjj`, `ceb351cf..HEAD`,
`apps/web/src` plus `apps/web/measure-toolbar/`, `docs/adr/0115-a-bound-governs-what-it-encloses.md`
and `docs/TECH_DEBT.md` #204.
**Authority:** `m0-measurement.md` including its Corrections and "The decisive measurement", read
first and treated as ground truth over `spec.md` wherever the two disagree.

This is written after the M7 gate pass and after the two post-review fixes (`max-w-64` re-scoped to
the facts; the M3 order docblock corrected). Where I disagree with those reviews I say so. Where I
say **reverse**, I mean reverse.

---

## 0. Verdict

**It adds up as one design for four of the six milestones, and the epic's headline sentence hides
the two that pull the other way.**

M1, M3 and M4 are one idea stated three times — _the object bar gets the row's width; the facts
yield it; the row does not grow_. They compose, they were measured against each other, and each was
corrected by measurement rather than argument. M2 is orthogonal and correct. M5 is unrelated
housekeeping that shipped half-done. **M6 gives back at 1440 most of what M1 and M4 won there**, and
no document nets the two.

Two things are wrong enough to fix before this ships, and neither is a defect in the product:

1. **The epic's headline claim has no gate**, and the gate that exists asserts the defect it fixed
   as current behaviour (`dock.spec.ts:143-147`).
2. **The state this whole epic is about has still never been photographed**, in a milestone whose
   entire subject is appearance.

One decision I would put back to a measurement before shipping: **the icon-only `Zoom to
selection`**. M1 chose it against a 775.6 px container that M4 then widened by 231 px, and nobody
re-ran the arithmetic afterwards. That is this repository's own §19.11 rule — re-verify the problem,
not only the design — applied one milestone along.

I did not find an architectural defect in the code. The seams are right, the predicate lives in the
right file, the scope reuse is the correct instrument, and the promotion mechanism was used as
designed. Everything below is about **evidence, disclosure and drift**.

---

## 1. Does this add up as one design, or six local fixes?

### The coherent core: M1 + M3 + M4

These three are not independent. Read together they are one rule:

> _The foot row has one line of height. The object bar spends it; the plan's facts yield it; neither
> region moves when the other changes._

- M1 takes 338 px out of the bar (`965.4 → 699.1`, `m1-icon-only.json` variant F, and only variant F
  and E fix 1646 — both halves load-bearing, and `m0-candidates.json` D proves omission alone is
  insufficient).
- M3 gives the bar a fixed leading edge, on the argument that survived after M0 §2 falsified
  ADR-0114 D2's stated one.
- M4 hands the bar the 231 px the facts were holding, which is what reaches 1440.

Each was contradicted by its own measurement at least once and corrected in place (`m4-shrink.spec.ts:16`
— _"M4 shipped as a no-op"_ — is the clearest example, and the fact that it is written down is the
strongest signal in the diff). This is a coherent design, and the corrections are what make it one.

### M2 is orthogonal, correct, and does not belong to that rule

It changes no geometry and no arithmetic. It is in the epic because the product owner asked in the
same message. That is fine; it should not be read as part of the same argument, and the ADR does not
read it that way.

### M5 is housekeeping and it shipped half-done

`Edit plan…` left the popover (`plan-summary-panel.tsx:45-64`, with a good docblock). The other two
halves of the planned M3 did not ship and were not filed:

- `Data date` still renders **twice inside one popover**, ten lines apart across a `border-t`:
  `plan-summary-panel.tsx:31-32` and `ScheduleSummaryStrip.tsx:108`. This was
  `implementation-plan.md` Task 3.2-T1, and `design-review.md` §2b/§8 called it _"the real defect"_
  and _"unambiguous, costs nothing, needs no decision"_.
- `PlanActionsMenu` still exists with no caller and a third `Edit plan…`
  (`plan-actions-menu.tsx:74`), while `plan-chrome-dialogs.tsx:66` describes it as a live surface.
  This was Task 3.1-T2, with Task 1.2-T2 step 3 instructing that a register row be filed for it in
  M1 if it were not deleted. Neither happened. `docs/TECH_DEBT.md` has no row for it and #204 does
  not mention it.

Noticing drift and stepping over it leaves the register exactly as wrong as not noticing — the
ADR-0071 rule the spec itself cites at §5.7.

### M6 partly reverses M1+M4 at 1440, and nothing says so

See §5 below. This is the one place where the epic reads as six fixes rather than one design: the
Consequences line _"the foot row is 41 px in both states at 1920, 1646 and 1440. At 1440 it was
117 px"_ (`ADR-0115:145`) is true and, standing beside D7's 58 px, leaves the reader to do a
subtraction nobody has done on the page.

**Verdict on Q1: not incoherent. Four milestones are one design; two are adjacent. The presentation
is more unified than the result, and that is a disclosure problem rather than a design one.**

---

## 2. Is a surface scope the right instrument for the foot row?

**Yes, and it is the only cheap instrument available. I would not change it.** The reasoning at
`activity-bottom-panel.tsx:224-243` is right on every count I could check:

- `Surface` contributes `bg-background text-foreground` and `data-surface` and **nothing else**
  (`surface.tsx:115-125`). No padding, no border, no radius. The 40 px floor is untouched. Verified.
- `chrome` is already a complete family and already swept: `token-contrast.test.ts:25-26` enumerates
  all seven scopes against every pair, so M2 creates **no** unasserted token pair. The ADR's
  "260 assertions" claim is structurally sound.
- A new scope was correctly refused. ADR-0077 §1's load-bearing condition — restated in
  `surface.tsx:38-40` — is that the fill must be chosen for a reason the page's fill structurally
  cannot serve. The foot row's reason is _"it is chrome"_, which is the band's reason, so it is the
  band's scope.

**Taking none of the band's geometry is also right.** `radius`, `shadow` and the amber rule are
where ADR-0114 D6 measured the cost, and this row's entire value is that it takes no height.

### But the composition it produces is half-right, and that is worth stating

Q2 asks whether "navy header / light canvas / light panel / navy foot" is a chrome model or an
accident. Measured against the DOM, it is **neither symmetric nor a peer relationship**:

| band         | geometry                                               | DOM position                                                                                           |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| chrome band  | card: `rounded-lg border border-b-[3px] shadow-md`     | shell, full-bleed                                                                                      |
| stage        | card: `rounded-lg border shadow-md` (`:1567`)          | workspace body                                                                                         |
| **foot row** | **full-bleed strip, `border-t`, no radius, no shadow** | **collapsed: sibling of the stage. expanded: last child of `<section aria-label="Activities panel">`** |

Two consequences the epic has not named:

1. **The two navy bands say "same system" by colour and "different things" by geometry.** The header
   is a floating card on the gradient inset; the foot is a full-bleed strip. That is a defensible
   reading (a status bar is not a card) but it is a decision nobody made — it fell out of taking
   values without geometry, which was chosen for cost.
2. **Expanded, the plan's facts, the object-action bar and the pen's `role="status"` region live
   inside `aria-label="Activities panel"`** (`activity-bottom-panel.tsx:68-73` opens the section;
   `:146` renders the foot row as its last child). Collapsed, they do not
   (`ActivityPanelCollapsedBar` renders the row standalone). **The row's landmark membership still
   flips between panel states** — the juggle the epic removed visually is still present in the
   accessibility tree, and M2 has now made the paint disagree with the tree as well: navy says "peer
   of the header band", the landmark says "part of the Activities panel".

This is pre-existing from ADR-0114 M4 and M2 makes it visible rather than causing it. It is a
**suggestion**, not a blocker — but it should be a register row rather than something the next
reader rediscovers.

---

## 3. The `clearPlacementApplies` threading

**The seam is right and I would not change it.** Specifically:

- `isVisible` is the only runtime mechanism available. The conditional-registration idiom used by
  `notes` / `progress` / `duplicate` in the same file is build-time flag spreading and cannot express
  a per-plan runtime fact. `isVisible` is the registry's own vocabulary for "does not apply", already
  used two ways in this file (`ctx.canvas !== null`, `ctx.conflictKey !== null`).
- Putting the predicate in `conflict-remedy.ts` and having `clearVisualPlacementGate` **call** it
  (`conflict-remedy.ts:111-115, 131`) is the correct shape: `schedulingMode` is read once, the gate
  stays total, and `BulkActionGate` is not widened for the plural bar where `applicable` is
  meaningless. The docblock at `:106-109` argues exactly this and it holds.
- The default direction is right and the reasoning at `build-selection-context.ts:49-58` is the best
  paragraph in the diff: a host that forgets the field gets today's behaviour, not a vanished
  control. That is ADR-0081's defect made structurally impossible.
- `plan-workspace-toolbar.tsx:252-263` narrowing `schedulingMode` **once** for all four call sites,
  after a component review caught four hand-copied ternaries, is the right fix in the right place.

**Should the registry know? Yes — but three things now share one predicate name and differ in kind,
and nothing says so.** `isVisible` in `selection-actions.tsx` now reads:

| item                     | source                      | kind                                     |
| ------------------------ | --------------------------- | ---------------------------------------- |
| `zoom-to-selection`      | `ctx.canvas !== null`       | host capability                          |
| `conflict-remedy`        | `ctx.conflictKey`           | object state                             |
| `clear-visual-placement` | `ctx.clearPlacementApplies` | **plan state, pre-computed by the host** |

The third is the first field on `SelectionActionContext` that is about the **plan** rather than the
object or the reader, and it is the only one handed in already-decided. A fourth author will guess.
One sentence at `selection-actions.tsx:104` would settle it.

### One consequence nobody recorded: the gate now has an unreachable branch

`clearVisualPlacementGate`'s first branch returns `'Only available in Visual mode'`
(`conflict-remedy.ts:131-133`). Both consumers now omit the item in that state — the object bar via
`isVisible`, and the Gantt row menu via **the same predicate**, because it derives its roster from
`selectionActionItems` and filters on `isVisible` (`GanttRowMenu.tsx:99-101`). So that reason string
is **unreachable in the product** and survives only in unit fixtures
(`selection-actions.clear-placement.test.tsx:146`, `conflict-remedy.gate.test.ts:36`).

`spec.md` AC-2.3 justified keeping the branch on the ground that it _"stays the reason string for the
Gantt row menu and any other consumer"_. **That is false as shipped.** The branch should stay (the
gate should be total), but the reason it stays is now "so the gate cannot be partial", not "so the
Gantt can read it" — and the docblock should say so, or the next reader will delete it as dead and
break totality.

`docs/TOOLBAR_ROADMAP.md:78` still documents the shade behaviour as current.

---

## 4. The measurement estate

**It is a liability today, and the cheapest fix is not to make any of it a gate.**

Facts, checked:

- `apps/web/measure-toolbar/` now holds **27 committed spec files**, ten of them from this epic.
- None run in CI. `.github/workflows/ci.yml` runs 40-odd `test:e2e:*` steps and no `measure:*`.
- `scripts/e2e-sweep.sh` derives its list from `test:e2e:*` script names, so the estate is
  structurally outside the sweep ADR-0112 built to stop suites rotting unnoticed.
- Every one of this epic's harnesses imports `../e2e-workspace-chrome/support` (e.g.
  `m4-shrink.spec.ts:3-11`, `m6-result.spec.ts:3-10`). When that module's helpers or selectors
  change, they break silently, forever.
- **`measure-output/` is gitignored** (`.gitignore:81-82`). So the evidence for every number in
  ADR-0115 exists on one machine and in prose. That is deliberate ("evidence, not artefacts") and it
  is the reason the next reader cannot check a figure without re-running a harness that may no
  longer run.

Recommendation, in order:

1. **Promote exactly one assertion into CI** — the 41 px equality (see §5 B1). One. The rest of the
   estate stays exploratory.
2. **Split the directory by intent.** `m0-*`, `m1-result`, `m6-result` are the _record_ and should
   stay. `m0-whatif`, `m0-verify`, `m0-candidates`, `m1-icon-only`, `m1-deck-load`, `m4-shrink`,
   `m4-states` are _exploration whose conclusion is already in the ADR_ — move them under
   `measure-toolbar/archive/` or delete them. Seven of the ten added this epic answer questions that
   are now decided.
3. **Add `apps/web/measure-toolbar/README.md`** stating in one paragraph: these are not gates, they
   are not run, they may already be broken, and the numbers they produced live in the ADRs. The
   ADR's own Consequences bullet asks this question, which means the next reader will too.
4. **Do not** convert `m1-result`/`m6-result` into gates as they stand. They take 240–600 s, drive a
   full sign-up→plan journey, and — per M0 C3 — depend on the Project Explorer's persisted width, a
   220 px user-controlled range against a 261.8 px budget. As gates they would be flaky for a reason
   that has nothing to do with the code.

---

## 5. Findings

### BLOCKING

**B1 — The epic's headline claim has no gate, and the gate that exists asserts the fixed defect as
current.**
`apps/web/e2e-workspace-chrome/dock.spec.ts:143-147` still reads:

```
expect(idle - withSelection, 'a selection may cost the canvas a line or two, never a band')
  .toBeLessThanOrEqual(120);
```

The pre-epic worst case at 1440 was **117 px**. It passes this bound. So the only CI-runnable
assertion about the thing this epic exists to fix **cannot distinguish the fixed state from the
broken one**, and its docblock at `:135` states _"measured 41 → 117 px at this viewport with a
selection"_ as current behaviour, which M1 and M4 made false.

`spec.md` S1 and `implementation-plan.md` Task 1.2-T1 both required this to become an **equality** at
1920 and 1646, with the measured bound kept at 1440. It did not. This is ADR-0110 D5's own rule —
_a gate is finished when it has been made to fail by the defect it was written for_ — unmet in the
epic that quotes it.

**Fix:** set an explicit viewport per case; assert `idle === withSelection` at 1920 and 1646; keep a
bound at 1440 carrying the measured number; verify red by reverting `isVisible` locally.

**B2 — At 1440 the diagram is 58 px smaller at rest than before the epic, and no document says so.**
Compared across two harness runs on the same fixture two hours apart, with 1920 and 1646 identical in
both as the control:

| viewport | canvas at rest, pre-epic (M0 §0) | after M1+M4 (`m1-result.json`) | after M6 (`m6-result.json`) |
| -------- | -------------------------------- | ------------------------------ | --------------------------- |
| 1920     | 776                              | 776                            | **776**                     |
| 1646     | 793                              | 793                            | **793**                     |
| **1440** | **560**                          | 560                            | **502**                     |

`m6-result.spec.ts` makes no selection, so 502 is the **at-rest** figure. Net at 1440: **−58 px at
rest, +18 px with a selection** (484 → 502). The 76 px M4 recovered on the selected state is
substantially spent by M6's third deck line.

D7 discloses the 58 px and calls it "the risk the product owner accepted" — correctly. What no
document does is net it. `ADR-0115:145`'s Consequences reads as a gain at all three widths. Given
that six prior epics on this surface are recorded for exactly this class of overstatement, the ADR
should carry the table above.

This is not a request to reverse M6. It is a request to state its price against the epic's own win.

**B3 — `selection-actions.tsx:992-994` states the defect this epic fixed as a current cost, in the
file the epic edited, after being flagged with a file:line and a checklist item.**

```
// The cost is height — the row wraps to 77 px at 1920 and 117 px at 1646 with a selection —
// which is what the streamlining beside this exists to reduce.
```

Wrong twice: those were the pre-ADR-0114-D7 numbers with the viewports shifted one column (M0 §0
measured 41 at 1920 / 77 at 1646), and after M1+M4 the row is **41 px at all three**.
`design-review.md` §1e named this exact line range and §10's checklist listed _"Fix
`selection-actions.tsx:952-954`, which states pre-ADR-0114-D7 heights as current"_. The file was
edited 350 lines above and the comment was left.

**B4 — M2 has no coverage of any kind, and the state the epic is about has still never been
photographed.**

- No unit assertion pins `data-surface="chrome"` on the foot row. The precedent exists one directory
  over: `chrome-band.test.tsx:37` — _"wraps the header and the slot in ONE chrome surface"_.
  Deleting `tone="chrome"` from `activity-bottom-panel.tsx:217` breaks nothing.
- No journey asserts the row's height at rest at any width (spec S2).
- **`apps/web/scripts/shoot.mjs` has no shot of a selected activity with the foot row visible.** Its
  five `plan-workspace*` shots are unchanged (`:340, :345, :356, :392, :403`), and
  `plan-workspace-editor` opens a modal `<dialog>` over the row. No harness in
  `measure-toolbar/` screenshots either (only `busy-band.spec.ts:111`, from a prior epic).

`design-review.md` §2a called this _"the first task of the epic, before any design"_ and one of the
two things that _"outrank the five"_. A milestone that repaints a band on every plan in the product
shipped with a token argument and a height reading and **no picture**, in a repository whose ADR-0099
exists because four consecutive width epics went wrong for want of a screenshot, and whose ADR-0101
records a four-scrollbar panel reaching a user because the shot list stopped at the route.

**Fix:** add `plan-workspace-selected` to `shoot.mjs` (select via the listbox, take no further
action) and one unit assertion on the scope. Both are small; the shot is the one that matters.

**B5 — M5 shipped half of the planned milestone and filed nothing for the rest.** See §1: the
duplicated `Data date` (`plan-summary-panel.tsx:31-32` + `ScheduleSummaryStrip.tsx:108`) and the
dead `PlanActionsMenu` with its third `Edit plan…` (`plan-actions-menu.tsx:74`;
`plan-chrome-dialogs.tsx:66` calls it live). Neither is in `docs/TECH_DEBT.md` #204 or anywhere else.

Also: **the count gate the spec named does not exist.** S3 / Task 3.1-T3 required a journey assertion
that exactly one control in the workspace is named `/^Edit plan/`, _plus_ a positive assertion that
pressing it opens the form, verified red twice. What shipped is two component-scoped **absence**
assertions (`plan-summary-panel.test.tsx:71`, `tsld-toolbar.test.tsx:240`) in two files that cannot
see each other, and an unrelated presence assertion in a third
(`plan-workspace-toolbar.test.tsx:454`). A unit test mounting one component structurally cannot count
across a workspace, and the two absence assertions pass equally if the pencil disappears too — the
ADR-0093 D3 shape the plan quoted when specifying the gate.

### SUGGESTIONS

**S1 — Re-measure the icon-only `Zoom to selection` now that M4 exists. This is the one decision I
would consider reversing.**

M1 chose icon-only against `m0-candidates.json`: omitting `Clear visual start` alone leaves 819.4 px
of items against **775.6 px** available at 1646. Correct at the time. **M4 then handed the dock
231 px** (`plan-facts.tsx:96-101` — _"takes the dock to 801 px against the 763 px it needs"_ at 1440),
which puts 1646 at roughly **1007 px**. M0 prices the label at ~116 px, so a labelled nine-item bar is
about 879 px — **fitting at 1646 with ~128 px of margin and comfortably at 1920, and still wrapping at 1440.**

No variant in `m1-icon-only.json` measured "omit CVP, keep the label" — the four variants all hold
zoom icon-only except `today` and `G` (which keeps CVP). The question was asked before M4 and never
re-asked after it. That is §19.11's _re-verify the problem statement_ rule, one milestone along, and
it matters because the label is contested on the merits by three separate records:

- `selection-actions.tsx:448` — the bar's own rule, _"a label is not something to trade away for
  width"_, which is now false and uncorrected (see S2).
- `Deck.tsx:71-83` — the only written test in the codebase for "may this go icon-only", a **closed
  set** of six standardised glyphs with the test _"would a planner who has never seen this product
  guess wrong?"_. A crosshair for "frame the viewport on the selected activity" fails it. The object
  bar reached the same state through a **different mechanism** (`showLabel: 'never'`), so the closed
  set did not govern and nothing checked it. There are now two routes to icon-only and only one has
  a rule.
- `docs/TECH_DEBT.md` #204(a) — the touch-only naming gap, newly created on a new surface.

**What I recommend:** one harness run of "omit CVP + labelled zoom + M4's bound" at 1920/1646/1440.
If it fits at the product owner's two widths, the choice goes back to them as _"a label at 1920 and
1646 and a wrapped row at 1440, or no label anywhere"_ — which is a real question and not the one
they were asked. If it does not fit, keep what shipped and record the re-measurement, because the
arithmetic above will otherwise be rediscovered by the next reader.

**S2 — Four stale docblocks, all about things this epic changed.** Listed with file:line because
each one is the first thing a reader of that file sees:

| location                           | says                                                                                       | truth                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selection-actions.tsx:448`        | _"Every item pins `showLabel: 'always'`"_ — heads the array                                | `zoom-to-selection` is `'never'` (`:838`). The correction is 350 lines away at `:800`. This file records at `:795-798` that a comment disagreeing with its neighbour about how many items it governs is _"the drift class this repository keeps filing"_ |
| `plan-summary-panel.tsx:4-11`      | _"offers an **Edit plan…** shortcut for writers. `onEdit` is null for a read-only viewer"_ | Both removed by M5. The correction is 40 lines below, in an inline comment the hover tooltip will not show                                                                                                                                               |
| `tsld-toolbar-items.tsx:2798-2800` | _"the Summary popover, which also carries an 'Edit plan…' shortcut"_                       | Removed by M5, in the registry file M6 edited                                                                                                                                                                                                            |
| `docs/DESIGN_SYSTEM.md:345`        | `chrome` — _"the top band"_                                                                | Two consumers now. This table sits eight lines under a note recording a previous instance of the same drift                                                                                                                                              |

Also `canvas-dock.tsx:78` — _"the row's two fixed ends ("Activities", the expand button)"_ — the dock
now leads, so "Activities" is not an end; and `tsld-toolbar-items.tsx:2685` names two promoted lens
toggles where there are three.

**S3 — The facts now wrap at every width, including where there is 1049 px of slack, and the ADR
frames the bound only as an enabler.** `max-w-64` (256 px) is a hard cap on ~381 px of ink, so the
facts are **permanently two lines** — at 1920 as well as 1440. `design-review.md` §6 warned against
exactly this: _"do not make it the default … two lines of 12 px grey text is worse to read than one
line, and at 1920 the facts have no width pressure at all."_ And `plan-facts.tsx:120-127`, three
lines above the code, quotes ADR-0110 D4's withdrawal of a container query on this same element with
the reason _"the thing that decides whether they need to collapse is whether the ROW is tight …
known at the row, not here"_ — the shipped bound sizes the facts without reference to the row's
pressure, which is that objection in the other direction.

I am **not** asking for a reversal: the unconditional cap is what makes 1440 work, and `m4-shrink`
established that pressure-driven wrapping is unreachable on this tree. I am asking that D5 say the
facts are two lines everywhere and that this is a legibility cost paid to buy 1440, rather than
present the bound purely as the thing that "makes any of it happen".

**S4 — The 41 px is now a function of unasserted arithmetic that one added fact breaks.** Four facts
(~381 px of ink) in a 256 px box with 16 px column gaps lay out as exactly two 16 px lines = 32 px,
under the 40 px button floor. A **fifth** fact, or a longer locale date format (CLAUDE.md §17: i18n is
on the roadmap and code should avoid hard-coding locale), produces three lines = 48 px and the row
grows to ~53 px — which is precisely the defect two reviews caught during M4. Nothing pins it:
jsdom has no layout, no unit test asserts `max-w-64`'s **position** (row vs. wrapper), and no journey
measures the row at rest. **The cost of adding a fact to this row silently changed from "free" to
"12 px of diagram", and nothing in the repository says so.**

**S5 — The dock's strips make `SurfaceToneContext` and `[data-surface]` disagree, and it is now
live rather than hypothetical.** `CanvasDock` portals from inside `<Surface tone="canvas">`
(`TsldPanel.tsx:2522`) into the foot row, which is now `<Surface tone="chrome">`. CSS follows the DOM
and is right; React context follows the tree and reports `canvas`. `Surface`'s dev-only same-tone
guard (`surface.tsx:107-114`) therefore cannot see a `chrome`-in-`chrome` nesting here and would
throw on a legitimate `canvas` one. Nothing in the dock renders a `<Surface>` today, so it is latent
— one component away, and it is ADR-0097's "latent split pair" shape. `design-review.md` §4 and §10
asked for one sentence at the portal in `canvas-dock.tsx`; it is not there.

**S6 — `PlanFacts`'s second host was not checked.** `implementation-plan.md` Task 1.1-T3 named it:
_"the facts render in two hosts … a wrap rule that is right in the foot row may be wrong in a
full-width status bar. Check both, including below `md`."_ `max-w-64` applies unconditionally, so the
facts also wrap in `PlanStatusBar` (`plan-status-bar.tsx:42-46`), which is the host below `md` where
vertical space is scarcest. Nothing records measuring it. Probably fine — likely desirable on a phone
— but it is the risk the plan named and it went unanswered.

While there: `plan-status-bar.tsx:34-38` says _"an outlet is mounted only by the COLLAPSED activities
bar … expanded, that bar has unmounted and they render here"_. Stale since ADR-0114 M4 made the foot
row render in both states; not this epic's doing, but it is now load-bearing for reasoning about
which host applies.

**S7 — `Activities N` is now at the far trailing edge while `<h2>Activities` is at the panel's
leading edge.** ADR-0110 D1's stated justification was that the count _names the panel and gives its
size_. `design-review.md` §5 predicted the cost of a straight swap: _"a heading belongs at the
leading edge of the thing it names; sent to the trailing edge it stops reading as a heading."_ M3
shipped the straight swap and not the three-region arrangement. Collapsed this reads well — the count
sits next to the expand button. Expanded it does not, and `activity-bottom-panel.tsx:250-255` already
concedes the word appears twice. Worth one line in the ADR acknowledging that D4 weakens D1 of
ADR-0110, or a register row.

---

## 6. What is now owed, and what this epic made harder

### Owed

1. **The `Edit ▾` fold (ADR-0114 D8, ~226 px).** Still the only candidate that gives one line at
   every width in every common state, and the only one that fixes the actual shape of the problem:
   five of the nine remaining items — `Logic`, `Notes`, `Progress`, `Resources`, `Edit` — are five
   buttons into five tabs of **one dialog**. ADR-0062's whole subject was converging those surfaces;
   the bar never converged with it. Declined on 2026-08-26 as a different epic; the number that has
   changed since is B2's. If it is ever taken, `design-review.md` §3's correction stands: the trigger
   must name the **subject**, not the verb, because `notes` and `progress` are not pen-gated and
   burying a Contributor's only permitted action behind `Edit` is the false-statement defect.
2. **The deck at 1440.** Three lines, 166 px, and 502 px of canvas. Whether that is acceptable is a
   product question that should be asked with B2's table in front of it.
3. **The gates in B1, B4 and B5.** One equality, one screenshot, one scope assertion, one count.
4. **`docs/TECH_DEBT.md` #204(c)** — the focus drop when a mode flip unmounts `Clear visual start`.
   Explicitly unverified, needs a browser, and it is a WCAG 2.4.3 class this repository has fixed
   four times.
5. **`#131` widened, or `ToolbarButton` given an icon-only treatment that survives a touch device**
   (#204(a)). If S1's re-measurement restores the label, this goes away instead.
6. **The landmark question in §2.2** — whether the foot row should be hoisted out of
   `<section aria-label="Activities panel">` so its membership stops depending on the panel state.

### Made harder

- **The bar is at its floor.** #124's closing note is right that a tenth item re-opens it — and both
  levers this epic used are now spent. You cannot omit a second control (there is no second
  permanently-inapplicable one) and you cannot drop a second label without either extending
  `Deck.tsx`'s closed set or writing the rule that governs `showLabel: 'never'` on a `Toolbar`.
- **Adding a fact to the plan's facts now costs 12 px of diagram** (S4), invisibly and ungated.
- **New controls on the object bar now composite their alpha hovers on navy** (#204(b)), which the
  contrast matrix structurally cannot see. Every future addition needs a browser check that no gate
  provides.
- **The scope boundary now cuts across a landmark boundary** (§2.2), so hoisting the foot row out of
  the Activities panel later is a larger, more visible change than it would have been last week.
- **Seven exploratory harnesses now sit in a directory nothing runs**, importing a journey's support
  module, ready to rot (§4).

---

## 7. Checklist for the implementer

- [ ] `dock.spec.ts:143-147` — equality at 1920 and 1646, measured bound at 1440, explicit
      `setViewportSize` per case, **verified red** by reverting `isVisible` locally. Correct the
      docblock at `:135` in the same commit.
- [ ] Add B2's three-column table to `ADR-0115`'s Consequences, and say plainly that at 1440 the
      at-rest canvas is 502 against a pre-epic 560.
- [ ] Rewrite `selection-actions.tsx:992-994` (B3) and correct `:448` (S2).
- [ ] Correct `plan-summary-panel.tsx:4-11`, `tsld-toolbar-items.tsx:2798-2800`,
      `docs/DESIGN_SYSTEM.md:345`, `docs/TOOLBAR_ROADMAP.md:78`, `canvas-dock.tsx:78`,
      `tsld-toolbar-items.tsx:2685`.
- [ ] `shoot.mjs` gains `plan-workspace-selected`. Add one unit assertion that the foot row carries
      `data-surface="chrome"` (`chrome-band.test.tsx:37` is the shape).
- [ ] Run S1's harness variant — omit CVP, **labelled** zoom, with M4's bound — at all three widths,
      and either restore the label or record why not.
- [ ] Either finish M5 (drop `plan-summary-panel.tsx:31-32`; delete `PlanActionsMenu` and correct
      `plan-chrome-dialogs.tsx:66`) or file both in `docs/TECH_DEBT.md`. Add the journey count gate
      with its pinned positive case.
- [ ] One sentence at `canvas-dock.tsx`'s portal about the context/DOM scope disagreement (S5).
- [ ] `measure-toolbar/README.md`; archive or delete the seven exploratory specs (§4).
- [ ] File register rows for: the facts' 12 px cliff (S4), the second host (S6), the landmark
      membership (§2.2), and the two-routes-to-icon-only rule gap (S1).
- [ ] After any of the above touching a label or a layout, run the **whole** sweep
      (`scripts/e2e-sweep.sh`), not the suite CI names — ADR-0091 M7's lesson, re-recorded in
      ADR-0112.

---

## 8. What I got wrong, or could not settle

Recorded because this epic's own instruments were wrong six times and the rule is to say so.

1. **B2's comparison is across two harness runs, not one before/after run.** `m1-result.json`
   (15:55) and `m6-result.json` (17:58) were taken on different fixtures by different specs. I trust
   the 1440 delta because 1920 and 1646 are byte-identical across both (776 and 793), which is the
   control — but a single run measuring 1440 before and after the promotion would settle it
   properly, and that run has not been taken.
2. **S1's ~116 px for the zoom label is M0's estimate, not a measurement of the post-M4 tree.** The
   conclusion "the label fits at 1646 after M4" is arithmetic, and this epic's own C5 constraint says
   arithmetic is necessary and not sufficient. That is why S1 asks for a harness run rather than
   asserting the reversal.
3. **I could not settle whether the expanded-state landmark membership is a real AT problem** or
   only an inelegance. It needs a screen reader, which is `docs/TECH_DEBT.md` #154's standing gap,
   not something a code read answers.
4. **I did not verify the `chrome` scope's appearance at all**, because nothing in the repository
   renders it to an image. That is B4, and it means my "M2 is correct" verdict rests entirely on the
   token argument and the height reading — the same two instruments that were sufficient for M2's
   author. Neither of us has looked at it.
