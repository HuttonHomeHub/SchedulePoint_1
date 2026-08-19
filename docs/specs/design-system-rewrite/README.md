# The design-system rewrite — index

- **Status:** Draft — **stops for approval**. No application code, no CSS.
- **Author:** ui-architect, 2026-08-18
- **ADR number:** **0097**, assigned by the coordinator. Drafted here as
  [`adr-0097-draft-a-theme-is-a-system-not-a-palette.md`](../../adr/0097-a-theme-is-a-system-not-a-palette.md)
  and **filed into `docs/adr/` as the first task of the plan**, not the last — the ADR-0077 ordering,
  for the ADR-0071 reason. It cannot arrive alone: `scripts/check-counts.mjs:55` re-derives the ADR
  count from `docs/adr/`, so the file, the `CLAUDE.md` §16 entry, the banner count bump and the
  `docs/adr/README.md` row land in **one commit** or CI goes red.

## The mandate, as it now stands

Widened three times on 2026-08-18, each time correctly. Verbatim, in order:

> _"The theme and design were set at the beginning but as the app has developed it has been
> **constrained to existing design protocol**. This is your opportunity to **rewrite the theme and
> design from the ground up**."_

> _"**Layouts, toolbars, groupings, fonts, button types etc can all change if the agent thinks it
> will look better.**"_

> _"**I remove all restraints.** I want this app to be best in class in terms of ui/ux. you have free
> rein in all aspects and agents to make that happen."_

And, separately: _"if it's easier **remove the light dark and system theme and just have the
corporate**"_ — with _"**keep the mechanism, just remove the themes**"_.

**Three things are treated as inputs rather than constraints**, because they are part of what best in
class means: WCAG 2.2 AA; the canvas's colours carry meaning; it stays gated.

---

## Read in this order

| Document                                                          | What it is                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`diagnosis.md`](./diagnosis.md)                                  | What is actually undesigned, on named screens, with the file and line. Three categories.       |
| [`design.md`](./design.md)                                        | The vocabulary: one theme, **six** scopes, three new axes, the typeface, the rules, the gates. |
| [`screens.md`](./screens.md)                                      | **The product designed** — the six surfaces, at the level of composition and hierarchy.        |
| [`command-surface.md`](./command-surface.md)                      | **The reshape** — why 32 commands in a row is the wrong instrument, and what replaces it.      |
| [`hard-surfaces.md`](./hard-surfaces.md)                          | The vocabulary worked through against the canvas, the Gantt, the toolbar, tables, dialogs.     |
| [`typeface.md`](./typeface.md)                                    | The face, the four candidates, and the 58 % digit measurement that made `tnum` a gate.         |
| [`closure-measurement.md`](./closure-measurement.md)              | The closure, computed — and the six WCAG 1.4.11 failures it found on the navy scopes.          |
| [`migration.md`](./migration.md)                                  | The landings, the early look, the landing-page recommendation, and what gets worse.            |
| [`ADR-0097`](../../adr/0097-a-theme-is-a-system-not-a-palette.md) | The decision record.                                                                           |

---

## The four headline moves

1. **One theme, and the mechanism kept alive.** Corporate becomes the product's appearance; `.dark`
   is deleted; `:root` **is** the theme block, so a flash is structurally impossible rather than
   merely avoided. `THEME_SELECTORS` stays a list, `theme-boot.js` stays running and tested, and every
   new axis — density, type, elevation, motion — is declared inside the theme block, so a future dark
   variant is **a block of values and one entry** (`design.md` §0.5).
2. **The diagram joins the design system.** `resolveTsldPalette` resolves from
   `document.documentElement`, so the bar fill is the _page's_ `--primary` painted on a ground that is
   not the page. That is ADR-0055's original defect surviving in the one place ADR-0055 never reached,
   and the contrast matrix has **no canvas pair at all**. The canvas becomes a surface scope; the
   painter does not change a line.
3. **The command surface is reshaped, not fitted a fourth time.** `TOOLBAR_GROUPS` is already a menu
   structure; three epics rendered it as a row and made the row fit. Five menus, eight commands, one
   band — and the label arithmetic, the band floors, the hysteresis and the `⋯` all disappear
   (`command-surface.md`).
4. **The screens are designed.** One band above the diagram instead of four; the rail as the product's
   only navigator; the activity editor as a docked panel rather than a modal that hides the schedule
   it is editing (`screens.md`).

---

## Where the plan has been corrected by what landed

**Reviewed 2026-08-19, after Landing A began.** Four corrections, each recorded where it happened
rather than collected here. Two of them contradict this design.

| Correction                                                                                                                                                                                                                                                                                                    | Where                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Scopes are SIX, not five.** `auth` was to retire; measured, 15 of 18 tokens differ from the page and 12 perceptibly, led by a focus ring ADR-0077 M7 derived to clear WCAG 1.4.11. Every "five scopes" in these documents was wrong and is corrected.                                                       | `design.md` §1.4, `screens.md` §7, ADR D14        |
| **A family is 29 names, not 18**, because the closure pulls in eleven status fills — so the token-surface saving is a little under two thirds rather than the third claimed, and a dark theme now costs ~182 declarations rather than the "~110, not materially more expensive" the ADR asserted.             | `design.md` §0.5.1, ADR D14/D15                   |
| **`CHROME_RESIDUAL_PX` over-charging Row 2 by ~47 px was stale** — ADR-0091 M7 had already fixed it and the constant is `16`. The command-surface reshape rests on the menu argument alone.                                                                                                                   | `command-surface.md` §1, ADR head-note            |
| **The typeface is Space Grotesk, not Inter**, and the argument that carried Inter — _"distinctiveness belongs in the brand panel, not the data grid"_ — was overruled on the merits. Its consequence is that **weight** becomes the hierarchy channel, and weight has no token: 183 sites, 85 non-test files. | `typeface.md`, `design.md` §4.0 and **new §4.1a** |

**And one thing this design specified that it had no business specifying:** a metrics strip on the
organisation landing page, which that screen's own spec rejects by name as _"the single most common
dashboard mistake"_. Withdrawn (`screens.md` §6). It is the exact failure `migration.md` B's
condition exists to prevent, committed by the document that wrote the condition.

## The question that was asked of this design, and its answer

> _"Which tokens belong to the rebound family, and how is 'complete' decided? Three separate people
> have now found a token outside it that would fail if a component ever landed somewhere new, and
> each time the answer has been 'add that one'."_

**Completeness stops being a count and becomes a property** (`design.md` §1.5):

> **The defect is never "a token is not rebound". The defect is a pair whose two halves are governed
> by different scopes. A scope is complete when no pair a compiled utility can composite is split
> across two scopes.**

The page becomes an explicit `--page-*` family; the rebound set is **computed by closure** and
asserted rather than authored; and `Card`/`Popover` become **resets** rather than exceptions — which
keeps ADR-0055's promise that a `Card` means the same thing everywhere and closes a **latent** split
pair (`CardDescription`'s rebound `--muted-foreground` on an unbound `--card`). Latent, not live —
verified. That is the stronger argument: the pair is compilable, so it is one component move from
being real and nothing would report it.

---

## Critical questions

### Settled (product owner, 2026-08-18) — do not re-ask

|                           | Answer                                            | Note                                                                               |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **CQ-A** diagram ground   | **Yes — a quiet ground.** Now one set of values.  | As defaulted, and cheaper: one theme, not three.                                   |
| **CQ-B** row rhythm       | **One rhythm, at 28.**                            | A visible change to the Gantt (32 → 28) and the tables.                            |
| **CQ-C** control height   | **Move to 36 in this epic.**                      | Departs from the default. A measurement task, not a token edit — `migration.md` A. |
| **CQ-D** separation floor | **Report first, assert ≥ 1.5:1 with the values.** | A **house** number, not a WCAG one — the shape cue carries 1.4.1, on paper too.    |
| **Themes**                | **Corporate only; keep the mechanism.**           | `design.md` §0.5. Adding dark back: _a block of values and one entry._             |

### Answered (product owner, 2026-08-19) — do not re-ask

All five were put to the product owner with the architect's recommendation and its reasoning.
**Two of the five went against that recommendation**, and both are recorded as decisions rather
than quietly absorbed.

|          | Question                                        | Answer                                                                                               |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **CQ-E** | Does the landing page's UI wait one landing?    | **Yes** — Landing A, then B, then review. Its data half proceeded unblocked and is done.             |
| **CQ-F** | Activity editor: modal or docked panel?         | **Docked panel.** A planner edits an activity to change the schedule and a modal hides the schedule. |
| **CQ-G** | Does the org nav leave the header for the rail? | **Yes.** One navigator instead of two; frees 637 px of the scarcest width in the product.            |
| **CQ-H** | How much visible change per release?            | **One landing per release**, A then B then review.                                                   |
| **CQ-I** | Reshape: one epic or two?                       | **One epic, separate landings** — C stays liftable if the risk needs isolating.                      |

Two further decisions were taken at the same time and are larger than any of the above:

> **The typeface is Space Grotesk** (`typeface.md`), chosen from four candidates rendered on real
> product chrome. The brief was _"something with more character"_, and the choice went **against my
> recommendation** — I proposed the Manrope / Instrument Serif pairing. Recorded, with the
> reservation intact: distinctive numerals appear in every date of a 2,000-row table. If the tables
> come to feel tiring, that is the first place to look, and the remedy is a numeral-only fallback
> rather than reopening the face.

> **The scope on existing screens is "controls and interaction", not paint.** So the raw native
> `<select>`s on the library screens become the hand-rolled `Combobox` that already exists, and the
> bare text row-actions become the APG row menu `docs/UX_STANDARDS.md` already specifies. This
> **widens Landing F substantially** — it is no longer a restyle but a correction of interaction
> that has drifted from the documented standard. It also moves affordances people know the position
> of, which is the accepted cost and is named here so it is not rediscovered as a complaint.

## Stated defaults for everything else

Elevation stays borders-first, with a token so the model can say which mechanism it uses. Radius and
motion are **not re-derived** — `--radius: 0.625rem` already gives the old app's 8 px exactly.
**No component library**: the three things this rewrite most needs sit _below_ the layer one operates
at, and the behaviour it would supply is already shipped and APG-tested (`diagnosis.md` §4.2) — the
case is costed there rather than assumed. No new `VITE_` flag; the rollback is a commit boundary.
The login's composition is not reopened. The CPM engine is not imported and no migration runs.

---

## What was measured, what was not, and who I could not ask

This session had **no shell** and **no agent-launch capability**. Every ratio is either quoted from a
file that computed it or **hand-computed** from `globals.css` using this repository's own transform
(`apps/web/src/test/colour.ts`), and each says which. Every width is either quoted from
`docs/specs/workspace-*/` or is **labelled as a prediction with a falsification condition attached**,
because the single most repeated finding in those three epics is a width expectation contradicted by
its own measurement.

**The design collaborators were not run**, and `screens.md` §9 says which agent should be asked what,
at which point — `accessibility-reviewer` on the menubar's keyboard model and the plot floor _before_
values are chosen; `ux-reviewer` on the editor panel _before_ that decision is taken;
`component-reviewer` on the archetype set _before_ it is built; `performance-reviewer` on the
typeface's LCP cost. The register is full of findings that would have been cheap in design and were
expensive at review; that table exists so this epic does not add to it.
