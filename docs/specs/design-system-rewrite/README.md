# The design-system rewrite — index

- **Status:** Draft — **stops for approval**. No application code, no CSS.
- **Author:** ui-architect, 2026-08-18
- **Mandate:** the product owner, 2026-08-18 — _"For the theme and design you have a blank canvas.
  The theme and design were set at the beginning but as the app has developed it has been
  constrained to existing design protocol. This is your opportunity to rewrite the theme and design
  from the ground up based on the full feature set we have today and what you think will come in the
  future."_
- **ADR number:** **0097**, assigned by the coordinator. Drafted here as
  [`adr-0097-draft-a-theme-is-a-system-not-a-palette.md`](./adr-0097-draft-a-theme-is-a-system-not-a-palette.md)
  and **filed into `docs/adr/` as the first task of the implementation plan**, not the last — the
  ADR-0077 ordering, for the ADR-0071 reason. It cannot arrive alone: `scripts/check-counts.mjs:55`
  re-derives the ADR count from `docs/adr/`, so the file, the `CLAUDE.md` §16 entry, the banner
  count bump and the `docs/adr/README.md` row land in **one commit** or CI goes red.

---

## Read in this order

| Document                                                                    | What it is                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`diagnosis.md`](./diagnosis.md)                                            | What actually reads as undesigned, on named screens, with the file and line. Sorted into three categories. |
| [`design.md`](./design.md)                                                  | The design itself: the vocabulary, the rules, what each part is for, and the gates that hold it.           |
| [`hard-surfaces.md`](./hard-surfaces.md)                                    | The design worked through against the canvas, the Gantt, the command surface, tables, dialogs, the rest.   |
| [`migration.md`](./migration.md)                                            | Six landings, each shippable and revertible; the rollback; and what gets worse.                            |
| [`adr-0097-draft-…`](./adr-0097-draft-a-theme-is-a-system-not-a-palette.md) | The decision record, drafted to this repo's standard.                                                      |

## Relationship to the two specs in flight

- **`docs/specs/corporate-brand/`** — trimmed to verified token defects and the default-flip
  mechanics. **Its findings are an input here and are not re-derived**; `diagnosis.md` §0 says which
  are carried, which are extended, and the one I contradict (with the arithmetic).
- **`docs/specs/organisation-landing/`** (ADR-0098) — the first new primary screen in this world.
  Its §0.3 asks this rewrite for five things it cannot express today. `design.md` §6 answers all
  five by name, and `migration.md` L3 lands them before that epic needs them.

## The one-sentence version

The token layer can express **one axis — colour — scoped by one mechanism — the surface** (verified:
all 117 declarations in `globals.css:508-730` are colours; `--radius` is declared once at `:root:35`
and no theme restates it), and the app it now has to dress is a Canvas-2D diagram, a virtualized
Gantt, a 28-stop command surface and eleven data screens — so **the rewrite is not a new palette, it
is three more axes and one more surface**: the diagram becomes a scope with a validated family,
density becomes a token, and the type ramp gets a top and a data half.

## The question that was asked of this design, and its answer

> _"Which tokens belong to the rebound family, and how is 'complete' decided? Three separate people
> have now found a token outside it that would fail if a component ever landed somewhere new, and
> each time the answer has been 'add that one'."_

**Completeness stops being a count and becomes a property**, and the rebound set stops being a list
and becomes a closure (`design.md` §1.5):

> **The defect is never "a token is not rebound". The defect is a pair whose two halves are governed
> by different scopes. A scope is complete when no pair a compiled utility can composite is split
> across two scopes.**

Three parts: the page becomes an explicit `--page-*` family so all six scopes are symmetric; the
rebound set is **computed** by closure from the scope's fill and asserted rather than authored (which
pulls in `--destructive`, `--secondary`, `--destructive-hover` and the solid status triples with
nobody having to notice them); and a second fill inside a scope — `Card`, `Popover` — is a **reset**
rather than a member, which keeps ADR-0055's promise that a `Card` means the same thing everywhere
_and_ closes a **latent** split pair nobody has raised (`CardDescription` is a rebound
`--muted-foreground` on an unbound `--card`). Latent, not live — verified: there is no `<Card>` or
`bg-card` inside any of the six `<Surface>` sites. **That is the stronger argument, not the weaker
one**: the pair is compilable, so it is one component move from being real and nothing in the build
would report it, and a rule resting on that cannot be falsified by a component moving the other way.

## Critical questions — all four answered (product owner, 2026-08-18), settled, do not re-ask

|                           | Answer                                        | Note                                                                                  |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| **CQ-A** diagram ground   | **Yes — a quiet ground in all three themes.** | As defaulted.                                                                         |
| **CQ-B** row rhythm       | **One rhythm, at 28.**                        | As defaulted. A visible change to the Gantt (32 → 28) and the tables.                 |
| **CQ-C** control height   | **Move to 36 IN THIS EPIC.**                  | **Departs from the default**, which was to tokenise 40 now and move later. See below. |
| **CQ-D** separation floor | **Report in L0, assert ≥ 1.5:1 in L4.**       | As defaulted.                                                                         |

**CQ-C's answer creates a measurement obligation, and the plan must carry it rather than absorb it.**
The default existed because ADR-0090 and ADR-0091 derive the command surface's band floors from
**measured** control widths, and `e2e-toolbar-fit` asserts them — those two epics spent most of their
effort on a row that would not fit at 1646 px, and three of their milestones had a width expectation
falsified by their own measurement. Moving every control from 40 px to 36 px changes the inputs to
all of it.

So the height move is **not** a token edit. It is: change the value, re-run `measure:toolbar` at
1646, re-derive the band floors from what it reports, update `e2e-toolbar-fit`'s expectations to the
new measurements, and run every journey — ADR-0091's retrospective records three journeys broken by a
label change and found by CI rather than locally, and its own rule is that a layout change means
running all of them. Vertical space is the point of the change (chrome takes 31 % of the height at
1646), so **measure and report the vertical gain** rather than asserting one; four consecutive epics
have had a headline width or height number contradicted by their own measurement.

---

> **CQ-A — Does the diagram get its own ground colour, distinct from the page, in Light and Dark as
> well as Corporate?**
> Today only Corporate does, and only behind `VITE_CANVAS_VISUAL_LANGUAGE`
> (`globals.css:1013-1016`); in Light and Dark `--canvas` is byte-identical to `--card`
> (`:206`, `:424`). Making the canvas a surface scope is right either way, but a diagram ground that
> is a distinct working surface is the thing that makes a planner's screen read as a drawing board
> rather than a web page. **Default: yes — a warm, quiet ground in all three themes.**

> **CQ-B — One row rhythm across the Project Explorer, the Gantt and the tables, or three?**
> Today: tree `28` (`HierarchyTree.tsx:26`), Gantt `32` (`GanttPanel.tsx:66`), tables `py-2`
> (`data-table.tsx:139`). Three surfaces listing the same objects scan at three rhythms.
> Unifying them is a **visible change to all three**. **Default: one — `--row-h`, at 28.**

> **CQ-C — Control density: keep 40 px and tokenise it, or move to 36 px in this epic?**
> Shipped is `h-10`/40 px (`button.tsx:22`, `input.tsx:17`); `docs/DESIGN_SYSTEM.md:102` documents 36. One of them is wrong. 36 is the planner's rhythm — 1–3 hours a day in the tool
> (`PROJECT_BRIEF.md` §4), on a 1646 px screen where chrome already takes **31 %** of the height
> (`workspace-chrome/m0-band-measurement.md` §2). But ADR-0090/0091 derive the toolbar's band floors
> from **measured** control widths and `e2e-toolbar-fit` asserts them.
> **Default: tokenise at 40 now (byte-identical), and move to 36 as its own commit with
> `measure:toolbar` at 1646 in hand.** Not smuggled in as tidying.

> **CQ-D — Is the plot fill-to-fill separation floor a merge gate, and at what number?**
> The diagram's three bar states are separated by **1.27:1** (Light: ordinary vs critical) and
> **1.34:1** (Corporate: near-critical vs critical) — hand-computed in `diagnosis.md` §3.3. That
> ratio **is** the monochrome-print legibility test, because `resolvePrintPalette` prints these
> tokens on paper. **Default: report the number in L0 (the adjacent-surfaces precedent,
> `token-contrast.test.ts:189-213`), assert ≥ 1.5:1 in L4 once the values satisfy it** — a gate that
> is red on the day it lands gets deleted rather than fixed (ADR-0058).

## Stated defaults for everything else

Elevation stays borders-first (`diagnosis.md` §4.1 defends it). Radius, motion and the typeface are
**not re-derived** — `--radius: 0.625rem` already gives the old app's 8 px exactly. No component
library. No new `VITE_` flag — a `VITE_` flag is not an operator rollback and never was (ADR-0088);
the rollback is a commit boundary. `brand` and `auth` stay pinned and untouched (ADR-0077). Corporate
Dark is not planned. The CPM engine is not imported and no migration runs.

## What was measured, and what was not

This session had **no shell**. Every ratio in these documents is either quoted from a file that
already computed it, or **hand-computed** from `globals.css` using this repository's own transform
(`apps/web/src/test/colour.ts`) — and each one says which. The hand-computed figures are the
decision-bearing ones and **L0-T1 exists to execute them** rather than trust this document
(`CLAUDE.md` §19.10; ADR-0076 Class 3). One of them contradicts a sibling spec's hypothesis and
`diagnosis.md` §0.2 says so rather than routing around it — and its verdict was then confirmed
independently, along with a defect the same computation found that I had missed (§0.2, point 3).
