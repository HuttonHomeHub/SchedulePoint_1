# ADR-0093 — An object action belongs on the object

- **Status:** Accepted (2026-08-13)
- **Supersedes:** nothing. **Amends** ADR-0031 (the toolbar registry's command taxonomy) and
  `docs/specs/workspace-layout/design.md` §42.
- **Builds on:** ADR-0059 §4 (the Gantt ships read-only), ADR-0082 (omit vs shade),
  ADR-0090/0091 (the command surface's width, and its missing vocabulary), ADR-0092 (the canvas dock).

## Context

The product owner used `web-v0.88.0` and asked whether the toolbar's `Report progress` was
warranted, noting it was clickable only with an activity selected, that a second button doing the
same thing appeared at the foot of the canvas under the same condition, and that this looked like
the only button landing in two places.

**It was, and the enumeration is the finding rather than the impression.** Four command-surface
items consult the selection — `float-paths`, `add-note`, `clear-visual-placement`,
`update-progress` — and only the last has a twin on the canvas dock. In the other direction none of
the dock's eleven items has a command-surface twin except `progress`. The two copies were
indistinguishable in permission (`canProgress` / `canReportProgress`, Contributor+, neither
pen-gated), in precondition (a resolved selection) and in effect (`ActivityProgressDialog`).

The duplication was added **knowingly**: the dock item's own docblock says it is gated _"mirroring
the toolbar's Update-progress command's `canProgress` gate"_. Nothing was wrong in either file. The
wrongness existed only in the relationship between them, which is why a human read of either one
kept finding a correct item with a correct comment.

Three things made it visible this month, none of which existed when the toolbar item was wired:
ADR-0092 **docked** the selection bar, so two copies that had sat in physically separate places
became two rows of one screen; the recorded reason for the toolbar placement
(`workspace-layout/design.md:451`, _"a Contributor's primary action must not be buried"_) had been
satisfied by a surface that did not exist when it was written; and Row 2 had spent two epics
fighting for width.

## Decision

**D1 — An action whose subject is the selected object belongs on the object's surface.** The
command surface carries actions whose subject is the **plan or the view**: recalculate, zoom,
export, switch mode. If an item's `isEnabled` has to consult the selection, it is an object action
and the canvas dock is its home.

This is the mirror of ADR-0091, whose subject was that the command surface had no vocabulary for
things that are not commands — a mode, a fact, a subject. This is the same gap seen from the other
side: an **object action wearing a command's clothes**.

**D2 — `update-progress` is removed from the command surface.** The remaining routes are the canvas
dock, the activities-table row menu and the activity editor's Progress tab.

**D3 — The rule is a computed gate, not a comment.**
`selection-duplication.structural.test.ts` derives both rosters from the two registries and fails on
any command-surface item sharing an id or a normalised label with a dock item. Deriving matters: a
hard-coded roster of "the selection-gated items" is the ADR-0073 C4 defect in miniature, a literal
that silently falls behind the vocabulary it describes. Labels are normalised for trailing ellipsis
and case only, because the two surfaces punctuated differently on purpose (`Report progress…`
against `Report progress`) and a raw comparison would have called one action two.

A **second** assertion pins that the dock still offers it. The general test would pass equally if
**both** copies disappeared, and a reader arriving at a green suite could not tell "the duplicate is
gone" from "the capability is gone" — the ADR-0081 failure, where a milestone's tests validated code
no planner could reach. Both were verified red against the pre-removal code before being kept.

**D4 — No feature flag** (ADR-0061's reasoning). This removes a control and adds no capability, so
there is no second product to maintain and nothing to roll back to that one revert does not give.
It is also what ADR-0088 D1 established: a `VITE_` flag buys the operator no rollback at all,
because Vite inlines the constants at build time and the publish workflow passes none. The
mitigation is a commit boundary.

**D5 — The Gantt cost is accepted, not mitigated, and it is inherited rather than promised.** The
dock is canvas-only, so a Contributor in the Gantt view now reaches progress through the
activities-table row menu — which works there, and is collapsed by default. Two mitigations were
offered to the product owner and both declined: expanding that panel by default in the Gantt (which
spends the vertical budget ADR-0092 had just recovered) and giving Gantt bars a row menu (which
starts making the Gantt editable through the side door, an ADR-0059 §4 conversation rather than a
tidy-up). The acceptance has a **stated basis** — progress reporting from a Gantt selection is
picked up by the Gantt-editing epic — and that basis is written into `docs/BACKLOG.md` beside that
entry, not left in this ADR. A forward commitment living only in the document that made it is the
most perishable kind of claim there is.

## Options considered

|     | Option                                                                          | Verdict                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Remove the command-surface item; the Gantt keeps the table route                | **Chosen**                                                                                                                                                                                                                                                                                                 |
| B   | Remove it **and** give Gantt rows a menu mirroring the table's                  | Rejected — puts write actions on a surface ADR-0059 §4 shipped read-only by decision                                                                                                                                                                                                                       |
| C   | Lift the object half of the dock bar to workspace level so it serves both views | Right long-term, out of scope. `plan-workspace-toolbar.tsx:566` already says _"Selection is workspace state, not view state"_ and the dock outlet is already workspace-level — but `zoom-to-selection` and `isolate-logic` are canvas concepts, so this means splitting the bar. An epic, not a milestone. |
| D   | Keep both                                                                       | Rejected — no reader can tell which to use, and the two will drift. ADR-0062 records exactly that failure for a tab and a dialog rendering the same subject.                                                                                                                                               |

**The Gantt asymmetry inverted on reading, and that is worth recording.** It was first offered as a
reason to KEEP the toolbar item: the only selection-driven route in that view. ADR-0059 §4 says
_"The first ship is read-only … Editing is a later, separately-gated milestone"_ — so a write
affordance reachable from a Gantt selection is a hole in that story rather than a feature of it, and
removing this item makes the read-only claim **more** true. It does not make it true:
`add-note` and `clear-visual-placement` remain, which is recorded as this ADR's Q2 and follows D5 to
the same epic. Deciding it for one of three now and two later is how the next reader inherits a rule
with a hole in it.

## Consequences

**Measured, not asserted — and two of the three measurements changed what this ADR says.**
`docs/specs/progress-entry-convergence/m0-measurements.md` carries the readings, taken in Chromium
at **1646 × 1097** (the product owner's Surface Pro) with the pen enforced and every flag at its
default.

**The width argument is withdrawn.** The natural claim — that removing an item labelled at 163 px
buys Row 2 a label — is **false**: 13 inline / 11 labelled either side. Its width went straight back
into the ladder and was spent immediately. What the removal buys instead was not reachable by
reasoning: `clear-visual-placement` had been demoted into the overflow menu, comes back inline, and
the **`⋯` trigger disappears from Row 2 altogether** at 1646, so every Row 2 command is directly
reachable. This is the third consecutive epic in which a width expectation was contradicted by its
own measurement (ADR-0091 D4 withdrawn; ADR-0092 M4's merge gaining "exactly nothing"), which is
starting to look like a property of the ladder rather than three coincidences.

One honest consequence of that: the command promoted into the vacated slot,
`clear-visual-placement`, is one of the two write affordances still reachable from a Gantt selection.
This change makes it **more** prominent, not less. It does not alter Q2's disposition; it should not
be discovered as a surprise by the epic that inherits it.

**The plural-selection finding was confirmed and was overstated.** The spec derived from four files
that with several activities selected the ADR-0092 guard suppresses the singular dock bar while the
command item stays enabled and acts on the primary, and called it a defect acting on an unnamed
subject. Driven in a browser, the first half is exactly right — and the second is not: the plural
bar prints _"3 activities selected — “Cladding” is the subject of single-activity actions"_, so the
product names the rule on screen at the moment it applies. It is a two-surface inconsistency, which
the removal resolves. Corrected in place rather than quietly dropped: the claim decided nothing on
its own, but it was written before it was checked, which is the habit §19.10 is about. Checked
separately, because the removal could have made that sentence false: it does not — three
selection-gated items remain.

**The Gantt route holds**, so D5's acceptance rests on a true premise. Its first measurement did
not: a locator reading `/actions for/i` matched **six** Project Explorer rail menus and returned
`New project | Rename | Delete`. Scoping it to the activity's own name is what made it the
activities table. Recorded because it is this epic's own subject in miniature — a reading that looks
like evidence, of the wrong thing.

**Two harness facts worth carrying to the next canvas journey**, both found by running rather than
reading: Ctrl+click does **not** build a plural selection, because a Ctrl pointerdown also starts a
marquee (`TsldCanvas.tsx:1716`), so the click is a toggle and a zero-size sweep at once and the net
selection stays at one — `Ctrl+A` on the parallel listbox is the unambiguous select-all (ADR-0080);
and the plural bar's text is "N **activities** selected", reachable by
`data-testid="bulk-selection-bar"`.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction. Frontend-only; `database-architect` is not engaged because there is no
schema to design, not because a change was judged too small (§19.3).

## Links

- [`docs/specs/progress-entry-convergence/`](../specs/progress-entry-convergence/) — spec, plan and measurements
- `apps/web/src/features/tsld/toolbar/selection-duplication.structural.test.ts` — the gate
- `apps/web/e2e-workspace-chrome/progress-entry.spec.ts` — the journey
- [`docs/BACKLOG.md`](../BACKLOG.md) — the Gantt-editing entry, which inherits D5's requirement
