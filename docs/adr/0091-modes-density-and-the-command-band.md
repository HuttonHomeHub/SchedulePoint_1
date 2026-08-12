# ADR-0091: A mode is not a command — surface scopes for the plan workspace's command band

- **Status:** Proposed
- **Date:** 2026-08-12
- **Deciders:** Product owner, Claude Code

## Context

ADR-0090 M1–M5 shipped as `web-v0.85.0` and fixed the row's **fit** — 46 registered items across two
rows that overflowed their container by 109 px at 1920×1080, with two controls painted at 0 px
visible. Using the result on a 24" monitor made six further things visible, and five of them are one
sentence:

> **the command surface has no vocabulary for anything that is not a command.**

A mode (`Early | Visual`), a fact (`Finish 05 Jan 2026`), a subject (the plan's identity) and a
preference all get rendered as a button in a row, because a button in a row is the only thing the
registry knows how to make. `Early | Visual` and `Diagram | Gantt` do not _do_ anything — they set
how everything else behaves, which is the same relationship `Start editing` has to the toolbar, and
`Start editing` sits on the identity line rather than in a group.

**This ADR is written after M0, not before it.** ADR-0090's first recorded consequence is that it was
wrong three times for having been drafted without a shell; two of its figures were withdrawn in
place. So every number below names the run that produced it, and the two that changed the design are
stated as findings rather than folded in silently — see
[`docs/specs/workspace-modes/m0-modes-measurement.md`](../specs/workspace-modes/m0-modes-measurement.md).

### What M0 measured

| fact                       | value                         | run                                 |
| -------------------------- | ----------------------------- | ----------------------------------- |
| identity row height        | 45 px                         | `vertical-stack`, repaired          |
| `aboveCanvas`              | 249 px                        | same                                |
| identity **content** width | **849 px**                    | `vertical-stack`, `identityContent` |
| Row 1 slack at 1920        | 361 px                        | `item-widths`                       |
| mode cluster width         | 329 px                        | same                                |
| app header row free space  | **0 px** (1 child, 1888/1920) | `vertical-stack`, `appHeaderRoom`   |
| search icon verdict        | **COVERED**                   | `search-icon` (new probe)           |

Two of those falsified working assumptions, and both are recorded rather than absorbed:

- **The identity content is 849 px, not the ~450–500 estimated.** A merged row at 1920 needs 2290 px
  against a 1904 container — **386 px over**.
- **Decisions 2 and 4 draw on the same slack.** Keeping the four viewport commands inline at every
  width overflows Row 1 at **1440** by 17 px on its own, before any identity merge. The spec rated
  this risk high at 768; the measurement puts it inside the range the epic exists to serve.

A third, smaller finding is that the instrument itself was under-reporting: the vertical-stack
harness asked for six bands and reported five for the whole of ADR-0090 M5, because a band it could
not locate was `.filter()`ed out rather than failing. Every surviving number stayed correct, so
nothing looked wrong. That is the ADR-0058 defect class, and it is why M0 exists.

## Decision

### D1 — A mode gets its own place, beside the pen, not inside a command group

`Early | Visual` and `Diagram | Gantt` move out of Row 1's `Display` group and onto the identity
line, beside `Start editing` / `Stop editing`. They set the tone for how the plan is edited and
viewed; they belong with the control that says whether it can be edited at all.

**They do not leave the registry.** Rendering four segmented controls by hand would rebuild roving
`tabindex`, group labelling, ADR-0082 `disabledReason` wiring, `demotionGroup` pairing and the fit
gate's reach — each of which this register has already recorded shipping wrong once. `ToolbarRow`
widens from `{look, do}` to `{mode, look, do}`; the identity line renders a third `<Toolbar>`.

Amends ADR-0031 §2/§5(c) and ADR-0090 D1.

### D2 — `tier: 3` means **admitted last**, not exiled

`partitionByTier` sends tier 3 to overflow **unconditionally** (`toolbar-registry.ts:452-460`), which
is why the `⋯` never empties even at 3840 px with 745 px of slack. Tier 3 becomes a **candidate**
set, admitted into the row while slack remains.

The naive form of this change **silently withdraws the labels M2 bought**: `autoLabelsFit` sums the
whole `bar`, and tier-3 items are outside `bar` by construction — which is precisely why ADR-0090 M2
chose tier 3 over a low `priority`. So admission is **one-directional**: it reads the label decision,
and the label decision never reads admission. Feature-spec §4.6 designs the version that holds.

### D3 — Zoom presets move into `View ▾`, and the viewport fold is deleted

`Zoom out` / `Zoom in` / `Fit` / `Today` stay inline; the preset picker moves into `View ▾`. This
**relocates ADR-0056 §1, it does not withdraw it**: `pxPerDayForPreset`, `presetOf` / `isAtPreset`
and the required-width parameter are untouched. Only the surface that calls them moves.

It also settles `docs/TECH_DEBT.md` #130 and removes the M3-b defect ADR-0090 M5 found — a trigger
labelled `Week` is not a place a planner hunting for **Fit to plan** will look.

**D3a (default, reversible).** Finding 2 makes the four inline-everywhere commands overflow Row 1 at 1440. They therefore render **icon-only below `comfortable`**: 430 px becomes 128 px, saving 302 px.
No command disappears into a menu at any width — which is the part of decision 4 that mattered — and
their names remain in the accessible name and the `⋯`. _This was put to the product owner and taken
as the recommended default when the epic was told to continue; it is a one-line change to reverse._

### D4 — ~~Three bands above the canvas~~ **WITHDRAWN 2026-08-12.** Four bands stand; #129 is **not** approved

> **This decision is reversed, by measurement, before any of it was built.** The reversal is kept in
> place rather than edited away, because the reason is the useful part.
>
> `Toolbar` resolves its density from **its own `clientWidth`** (`Toolbar.tsx:266`). Today Row 1 is
> the full-width row, so that is ~1904 px and the reading is honest. **After a merge it is leftover
> width**: with breadcrumbs, the finish chip, the mode cluster and the pen beside it, Row 1's
> toolbar gets ~**891 px** — below every band floor — so at 1920 it resolves `collapsed` and
> **withdraws every plain-button label on Row 1**. That silently reverses ADR-0090 M2's headline
> win (which bought both rows their labels at 1920 for the first time) on the very monitor this
> epic was opened about.
>
> It is not tunable. For Row 1 to stay `comfortable` post-merge it needs 1536 of 1904, leaving 368
> for identity + finish + mode + pen, which measure **1013**. The "modest breadcrumb trim" D4a
> budgeted for would have to close **645 px**.
>
> And **no existing gate could have caught it.** `readRow` measures each toolbar inside its own box
> (`fit.spec.ts:115-116`), and a `flex-1` child always fits — so the fit gate would have gone green
> while the row went wordless.
>
> Put to the product owner with those numbers. Their answer: **keep the labels.** It is the same
> call they made earlier in the epic ("Labels win — demote the three"), and 45 px of canvas is a
> poor trade for making a dozen commands wordless. So the identity line keeps its own row.
>
> **What this costs:** the original complaint — "the 4 rows are unnecessary" — is _declined_, not
> solved. What still addresses it is the rest of the epic: M3 and M4c shorten Row 1 by ~306 px, and
> D2 lets the `⋯` empty. Vertical space is not recovered.
>
> **D4a is withdrawn with it.** Its arithmetic was also wrong on its own terms — see the correction
> in `m0-modes-measurement.md` §3.3: the pen cluster offers **165 px** of free saving, not 223. The
> message is the content of a `role="status" aria-live="polite"` region, so deleting it silences
> the pen-state announcement (WCAG 4.1.3); and the `Editing` badge carries **tone** (`warning` when
> someone _else_ holds the pen), which is exactly the case a planner most needs to see.

**Stated negatively, because scope creep here is cheap:** this ADR does **not** approve
`docs/TECH_DEBT.md` #129 (a plan-identity slot in the 56 px app header row). ADR-0029 and ADR-0055 S2
forbid it — the shell is plan-unaware — and M0 now also measures it **impossible**: that row holds one
child using 1888 of 1920 px, widest gap 0. The withdrawal of the merge does **not** reopen it: #129
was never the cheaper way to three bands, it was a worse way, and it is now measured shut as well.

### D5 — The glyph vocabulary

`docs/TECH_DEBT.md` #126 records that the four segment items carry **no icons**, which blocks any
compact treatment; ADR-0090 M3 built one anyway and got four blank 16 px buttons and a WCAG 2.5.8
failure within the hour. The set is **mechanism** — each glyph depicts what the mode does:

|      | Early             | Visual | Diagram     | Gantt        |
| ---- | ----------------- | ------ | ----------- | ------------ |
| icon | `ArrowLeftToLine` | `Hand` | `Waypoints` | `ChartGantt` |

Chosen by the product owner from three candidate sets, 2026-08-12. All four are verified present in
the installed `lucide-react@1.28.0`, each by the line that names its own export —
`arrow-left-to-line.mjs:15`, `hand.mjs:22`, `waypoints.mjs:19` and `chart-gantt.mjs:16`. The
citations are registered in `scripts/dependency-claims.json`, so a Dependabot bump of `lucide-react`
fails CI and the set is re-checked at exactly the moment it could have changed (ADR-0076 Class 2).
That matters more here than it looks: ADR-0090 M3 shipped four **blank** buttons, and an icon name
that silently stops resolving produces the same picture.

## Alternatives considered

- **Render the mode cluster by hand on the identity line.** Rejected: rebuilds five primitive
  behaviours the register has already recorded shipping wrong once each, and puts the cluster outside
  the fit gate's reach — the gate that exists because ADR-0090's defect was invisible to a human read.
- **Give the epic a `VITE_` feature flag.** Rejected on ADR-0088 D1: a `VITE_` flag buys **no**
  rollback, because `docker-publish.yml` passes no `VITE_` build arg and every published image carries
  every flag at its default. A second command surface would also be Class A against a `classACap` of 1.
  The mitigation is a clean revert per milestone, each independently shippable.
- **Merge identity into the app header row** (#129). Rejected on ADR-0029/ADR-0055 S2, and now also
  on measurement — there is no room.
- **Keep four bands and spend nothing.** Rejected: it declines the target, and the 223 px of pen
  redundancy is worth removing whether or not the rows merge.
- **A low `priority` instead of D2's candidate set.** This is what ADR-0090 M2 rejected on
  measurement, and D2 does not reopen it — `priority` orders demotion _within_ the bar; the defect is
  that tier 3 never enters the bar at all.

## Consequences

**Easier.** A mode reads as a mode. The `⋯` empties on a wide monitor instead of holding ~15 commands
behind a control that had 0 px visible at 1440 before M1. Three bands return ~45 px to the canvas.
The zoom preset stops being the only viewport control that names its subject.

**Harder / risks.**

- D2 and D4 **compete for the same slack**, and the identity merge has priority; admission takes the
  remainder. Written down here so a milestone under pressure cannot quietly resolve it the other way.
- D3a and D4a are **defaults taken without an explicit answer**, both flagged in place. If the product
  owner reverses either, the epic still lands — D4a's reversal costs the third band, D3a's costs the
  fold.
- The breadcrumb truncation in D4a is the one **real** information loss in this ADR.

**Debt.** #126 closes (D5), #130 closes (D3). #129 is declined with a measurement. #127, #131 and the
viewport-edge half of #124 are declined with reasons in the feature spec. The two ADR-0090 follow-ups
that never landed — `DESIGN_SYSTEM.md`'s layout-mode ladder, and ADR-0031's shape omitting the real
`priority` field while `:68` still says "`tier` is **priority**" — are absorbed at M7-T3. Both were
verified absent 2026-08-12 (`grep`), not assumed.

**Untouched.** The CPM engine is not imported and no migration runs, so the ADR-0034 recalculation
parity gate is untouched by construction. `database-architect` is not engaged because there is no
schema change to design — not because a change was judged too small to need it.

## References

- [`docs/specs/workspace-modes/feature-spec.md`](../specs/workspace-modes/feature-spec.md) — stages 1–4
- [`docs/specs/workspace-modes/implementation-plan.md`](../specs/workspace-modes/implementation-plan.md) — stage 5
- [`docs/specs/workspace-modes/m0-modes-measurement.md`](../specs/workspace-modes/m0-modes-measurement.md) — every figure above
- ADR-0090 (the command surface this refines), ADR-0031 (the registry), ADR-0056 §1 (relocated, not
  withdrawn), ADR-0082 (shaded controls keep their reason), ADR-0088 D1 (why there is no flag),
  ADR-0058 / ADR-0076 (why M0 measured first)
