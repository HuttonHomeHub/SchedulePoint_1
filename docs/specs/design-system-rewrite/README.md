# The design-system rewrite — index

- **Status:** Draft — **stops for approval**. No application code, no CSS.
- **Author:** ui-architect, 2026-08-18
- **ADR number:** **0097**, assigned by the coordinator. Drafted here as
  [`adr-0097-draft-a-theme-is-a-system-not-a-palette.md`](./adr-0097-draft-a-theme-is-a-system-not-a-palette.md)
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

| Document                                                                    | What it is                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`diagnosis.md`](./diagnosis.md)                                            | What is actually undesigned, on named screens, with the file and line. Three categories.    |
| [`design.md`](./design.md)                                                  | The vocabulary: one theme, five scopes, three new axes, the typeface, the rules, the gates. |
| [`screens.md`](./screens.md)                                                | **The product designed** — the six surfaces, at the level of composition and hierarchy.     |
| [`command-surface.md`](./command-surface.md)                                | **The reshape** — why 32 commands in a row is the wrong instrument, and what replaces it.   |
| [`hard-surfaces.md`](./hard-surfaces.md)                                    | The vocabulary worked through against the canvas, the Gantt, the toolbar, tables, dialogs.  |
| [`migration.md`](./migration.md)                                            | Six landings, the early look, the landing-page recommendation, and what gets worse.         |
| [`adr-0097-draft-…`](./adr-0097-draft-a-theme-is-a-system-not-a-palette.md) | The decision record.                                                                        |

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

### Open — and these are about ambition and sequencing, not permission

> **CQ-E — Does the organisation landing page's UI wait one landing for the archetypes?**
> **Recommended: yes**, and it becomes the **first fully-realised screen in the new language**
> (`migration.md` B). Its data work proceeds unblocked. The reasoning: it is new, so there is no
> legacy to preserve; it needs exactly the six archetypes; it depends on none of the slow work; and it
> is the screen they opened this thread about. **The fallback if even one landing is too long**: ship
> the six archetypes alone — they have no dependency on the token work and could land in days.
> The option I recommend against is "proceed and get restyled": it would build a sixteenth copy of the
> page frame and a fourth bespoke empty state, both of which Landing A then has to unpick.

> **CQ-F — The activity editor: modal dialog, or docked panel?**
> A planner edits an activity to change the schedule, and a modal hides the schedule. Every
> `ContextStrip` in ADR-0061 exists to carry facts into a dialog covering the surface those facts came
> from. **Recommended: a docked, resizable right panel**, keeping every ADR-0060/0061/0062/0089
> decision verbatim and changing only the container. It is the largest _behavioural_ change proposed
> and needs `ux-reviewer` before it is taken. Retiring it from the dialog also retires `Dialog`'s `xl`
> preset, whose only consumer it is.

> **CQ-G — Does the organisation nav (7 links, 637 px) leave the app header for the rail?**
> It is what funds the one-band workspace: 190 px of chrome becomes 56, and the canvas grows ~24 % at 1646. **Recommended: yes** — the header nav and the Project Explorer are the same layer wearing two
> shapes, and a planner should have one place to look for "where am I". The cost is that six
> destinations move to a zone in the rail, which is a real relocation for existing users.

> **CQ-H — How much visible change lands in one release?**
> The product owner's host pulls every release automatically (ADR-0047), so "merged" means "in use by
> tomorrow". **Recommended: one landing per release**, with A (invisible) and B (a new screen) first,
> and the surfaces they use daily — C, D, E — only after they have seen and approved the language.
> The alternative is to batch C+D so the workspace changes once rather than twice; that is a real
> option and it trades review size for churn.

> **CQ-I — Is the command-surface reshape one epic with the token layer, or two?**
> **Recommended: one epic, separate landings.** They share no code — the menubar consumes the token
> layer and nothing else — but they share a _thesis_, and splitting them means the reshape gets
> re-justified from scratch against three epics of prior measurement. The counter-argument is real and
> should be put: the reshape is the single highest-risk item here, it may be **withdrawn by its own
> measurement**, and a separate epic would let the rest land regardless. **If the product owner wants
> the risk isolated, split it — the plan is written so C is liftable.**

---

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
