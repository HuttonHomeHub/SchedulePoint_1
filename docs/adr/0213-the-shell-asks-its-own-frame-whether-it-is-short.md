# ADR-0213: The shell asks its own frame whether it is short, in the text the reader has

- **Status:** Accepted. It ships in the large-text-dock M1 pull request with its implementation.
- **Date:** 2026-11-07
- **Deciders:** Product owner (spec questions, 2026-11-07: Q1 B, guarantee the foot bar for any way of
  enlarging text; Q2 A, leave a strip that arrives off-screen in place) and Claude Code (ui-architect,
  the remedy after M0).
- **Spec:** [`docs/specs/large-text-dock/feature-spec.md`](../specs/large-text-dock/feature-spec.md) §4.6–§4.9
  · **Plan:** [`implementation-plan.md`](../specs/large-text-dock/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/large-text-dock/m0-measurement.md). Closes
  `docs/TECH_DEBT.md` #569.
- **Amends:** ADR-0185 D5. Its `squat` variant (narrow and short: the shell scrolls and the band scrolls away
  over a full-height `<main>`) keeps its condition, its rows and its single consumer; what changes is
  **what is asked**: the shell's own frame, in the root size in force, instead of a media query.
- **Builds on:** ADR-0179 (1.4.4 and 1.4.10 still hold below the floor), ADR-0114 (the band is never asked
  to scroll inside itself), ADR-0115 (a bound governs what it encloses), ADR-0113 and ADR-0142 (the problem
  and the remedy were measured first), ADR-0088 D1 (no flag), ADR-0111 (no keyboard contract changes).
- **Does not amend:** ADR-0092. No floor is added under the body.

## Context

At 1024 × 600 with the page's root font size doubled, the command band covers the bar at the foot of a
plan, so no transient strip (conflict, selection actions, history result, touch tip) can be pressed with
a pointer (#569). The keyboard still reaches them.

M0 measured two ways of doubling text (`m0-measurement.md`):

- **A browser's own text setting** (CDP `Page.setFontSizes`, 32 px) already works. `squat`
  (`(width < 64rem) and (height <= 26rem)`) matches, row 3 becomes `100dvh`, the shell scrolls, and every
  strip control is self-hit once scrolled into view, fine and coarse, Diagram and Gantt.
- **A root size set by a user style sheet or extension** (`html { font-size: 200% }`) does not. A `rem` in a
  **media** query is the browser's initial 16 px, so `squat` stays off; the band is 707 px (fine) and 931 px
  (coarse) in a 600 px window, `<main>` resolves to 0 and the foot row sits under the band.

The approved scope (Q1 B) is every route. Two remedies were measured as injected styles on the same page:

- **R1**, a floor on row 3 (`minmax(min(100dvh, 12rem), 1fr)`) with the shell scrolling on y. Its rects
  equal base at 100 % in all 49 sweep cells at 12 rem (15 rem fails at coarse 1024 × 500). But the
  organisation landing **already overflows** the shell at 100 % (793–797 px against 500–720, more under
  1024 wide), hidden by the shell's `overflow-hidden`; R1's `overflow-y: auto` would show it as a classic
  scrollbar on every such landing on Windows. And the coarse selection bar (667 px) is taller than R1's
  384 px body.
- **R2**, `squat` as a container query on a size container exactly the window high. Equal to base at 100 % in
  every fine cell and every coarse cell (the two differing readings differ only by a tooltip portalled to
  `document.body`, which no ancestor in `#root` can affect); equal to base under CDP 200 %; `<main>` = 600
  under the inline route; every strip control reachable; the shell's overflow at 100 % unchanged. Without
  `height: 100dvh` on the container it fails: size containment makes an auto-height block 0 px high, so the
  query's height is 0 and `squat` matches in every window under 64 rem.

## Decision

We will make the shell ask its own frame, not the window's media features, whether it is narrow and short.

1. **D1 — The shell grid sits in a frame that is a named size container exactly the window high.** A
   `.shell-frame` utility in `globals.css` declares `container: app-shell / size; height: 100dvh`, and
   `AppShell` wraps the grid, and only the grid, in it. The grid's own classes do not change.
2. **D2 — `squat` is a container query on that frame, and the media query is removed.**
   `@custom-variant squat` becomes `@container app-shell (width < 64rem) and (height <= 26rem)`. The
   condition is `SQUAT_QUERY` and the name `SQUAT_CONTAINER` in `lib/breakpoints.ts`, pinned by
   `breakpoints.test.ts`. A `rem` in a container query is the root element's actual font size, so a browser
   setting and a user style sheet produce the same layout. Inside the frame the two queries agree whenever
   the media `rem` equals the root (100 % text, every browser setting), so keeping both would add nothing
   but a wrong answer when a style sheet shrinks the root.
3. **D3 — The container is the frame, never `#root`.** `#root` also hosts the public screens, the auth shell
   and the guest view, which scroll the document. The frame confines size, layout and style containment to
   a box that already was exactly the window.
4. **D4 — `squat:` is used only inside the frame.** Outside it there is no `app-shell` container and the
   variant can never match. A structural test lists the files allowed to use it (today, `app-shell.tsx`).
5. **D5 — No other media variant is converted by this decision.** `lg`, `short`, `tall`, `xs` and the
   promotion stages still answer at the browser's initial size under a user style sheet. Only `squat`
   decides whether the foot bar can be reached; the others change density, not reach. Converting one is a
   separate decision with its own sweep.

## Alternatives considered

- **R1, a floor on row 3 and a scrolling shell.** Passes the rect sweep, but turns the landing's hidden
  100 % overflow into a visible scrollbar on classic-scrollbar machines, leaves part of the coarse selection
  bar unreachable when scrolled as a whole, and would have amended ADR-0092. Rejected on SC-4.
- **R1 plus a fix to the landing's overflow.** Two changes, one to a screen outside this work, to reach what
  D1–D2 reach with one; the coarse residual stays.
- **The container on `#root`.** Same shell geometry, but containment and a fixed height reach every
  document-scrolling screen, none of which were measured.
- **Media and container `squat` side by side.** Redundant where they agree, wrong where they disagree.
- **A band that scrolls inside itself.** Nested scrolling inside the deck and an ADR-0111 review; against
  ADR-0114.
- **A foot row pinned to the window.** Overlays the scene, risks WCAG 2.4.11, and the coarse selection bar
  alone is taller than the window at 200 %.
- **Test and register only.** Rejected by the owner (Q1 B).

## Consequences

- **Both routes to large text take the same scrolling form.** Under a user style sheet at 1024 × 600 the band
  scrolls away above a full-window `<main>`, as it already did under a browser setting. The foot row is below
  the window at rest in that form; a strip that arrives while the reader is scrolled to the band waits there
  (Q2 A, `docs/TECH_DEBT.md` #570).
- **Nothing changes at 100 % text or under a browser setting**, including whether the shell can scroll. The
  landing's existing overflow stays exactly as hidden as it was; it is a separate finding, recorded on #569.
- **Containment is real but inert here.** The frame is the containing block for fixed-position descendants
  and a stacking context. It sits at the window's origin, is the window's size and never scrolls, so a fixed
  descendant resolves to the same rect; the tooltip, `Menu` and toolbar popover portal to `document.body` or
  the topmost modal dialog, and `Dialog`, `Sheet` and the viewport notice are `showModal()` dialogs in the
  top layer, whose containing block is the initial containing block. M1 measures five overlays with and
  without the container to confirm it.
- **The frame is now the containing block for any in-frame `position: fixed` element.** That is fine today
  because the frame is the window's box at the origin and does not scroll; a future in-frame fixed overlay
  must know it, since the element would position against the frame and not the viewport.
- **A new `squat:` consumer must sit inside the frame**, and the structural test makes that a visible edit.
- **The frame's height is load-bearing.** Losing `height: 100dvh` makes `squat` fire in every narrow window;
  a structural test and the narrow-shell journey guard it.
- **Browsers without size container queries** (before Chromium 105, Safari 16, Firefox 110) never match
  `squat`; they are outside the supported envelope. Evidence that the envelope covers them:
  `docs/PROJECT_BRIEF.md` §16 (Deployment) names the latest two versions of Chrome, Edge, Firefox and Safari,
  all well past those minimums.
- **Follow-ups:** none required. If another media variant is ever found to decide reach under a user style
  sheet, D5 is where that decision starts.

## References

- `docs/TECH_DEBT.md` #569 (the defect), #570 (an arriving strip below the window).
- `docs/specs/large-text-dock/m0-measurement.md` (readings, both routes, R1 and R2, the 49-cell sweep).
- `apps/web/src/components/layout/navigator/app-shell.tsx` (the shell grid and its `squat` classes),
  `apps/web/src/styles/globals.css` (`squat`), `apps/web/src/lib/breakpoints.ts` (`SQUAT_QUERY`).
- `apps/web/src/components/ui/overlay-position.ts` `portalTarget()`, `apps/web/src/components/ui/tooltip.tsx`
  (the 159 × 26 fixed box in M0's coarse R2 readings).
- CSS Containment Module Level 3 (size containment, container queries); CSS Positioned Layout Level 4 (top
  layer containing block).
- ADR-0185 D5, ADR-0179, ADR-0114, ADR-0115, ADR-0113, ADR-0142, ADR-0088 D1, ADR-0111.
