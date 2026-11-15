# ADR-0222: The layout is designed at 1280 × 800, and the plan workspace scales to fit below it

- **Status:** Draft — kept beside its spec until the product owner approves both; it is then filed as
  `docs/adr/0222-the-plan-workspace-scales-to-fit-below-a-1280-by-800-window.md`.
- **Spec:** [`docs/specs/scaled-workspace/feature-spec.md`](feature-spec.md)
  · **Plan:** [`implementation-plan.md`](implementation-plan.md)
- **Date:** 2026-11-15
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:**
  - ADR-0179 — D1 (the designed floor moves from 1024 × 600 to 1280 × 800), D2 (the plan workspace scales
    instead of scrolling in the band between), D8 (the notice's copy), D9 and D10 (the designed sweep and the
    "made to fit" milestone move to 1280 × 800). D3–D7 (the notice itself) are unchanged.
  - ADR-0118 — D1's ≥ 44 px coarse house rule is stated at scale 1. Inside a scaled workspace the floor is
    WCAG 2.2 §2.5.8's 24 px, measured as rendered (D3 below).
- **Notes, not amended:** ADR-0180, ADR-0183, ADR-0185, ADR-0213, ADR-0219, ADR-0092's 350 px diagram floor and
  the short-window work. They keep their conditions, and they keep firing wherever the workspace is not scaled
  (D9). Which of them can retire is measured later, one at a time.
- **Builds on:** ADR-0088 D1 (no flag), ADR-0105 (a new control and a gate change need a spec), ADR-0113 and
  ADR-0142 (measure before building), ADR-0173 (a per-device preference), ADR-0213 (ask the box, not the window).

## Context

The owner, 2026-11-15 (recorded in `docs/HANDOFF.md`, "What is next", item 1): rather than keep making rules
for small windows, scale the app down so that it works at any size, as a tiny zoom. The design floor moves to
1280 × 800, a normal laptop. Below it the plan workspace (diagram, Gantt and their toolbars) scales down to
fit. Forms, dialogs and every other page keep reflowing normally.

**Why the 1024 floor became expensive.** Since ADR-0179 the workspace has had to fit a 1024 × 600 window by
rearranging itself. That produced a run of short-window rules, each with its own measurement:

- the panel takes the body (ADR-0180);
- rows grow under a finger (ADR-0183);
- the toolbar promotes and demotes commands (ADR-0185);
- the shell asks its own frame whether it is short (ADR-0213);
- the selected bar takes the whole foot row (ADR-0219);
- the whole-plan Follow logic offer moves into the selection bar (#1382).

At 1024 × 600 the diagram with a selection is still under its 350 px floor (`docs/HANDOFF.md`, "Known and
recorded"). The touch toolbar takes about 0.43 of the height in four rows (walkthrough rank 47, same file).
Each fix found the next limit.

**The catch.** Browser zoom and a larger text setting make the window look smaller to the app. A 1280 × 800
window at 125 % zoom is 1024 × 640 CSS px — the same numbers as a small laptop. A scale computed from CSS px
alone would shrink that reader's workspace back to 100 %, cancelling the zoom they chose. WCAG 2.2 §1.4.4
(text resizable to 200 % without loss of content or function) is a project requirement (CLAUDE.md §13), so
the scale must never do that.

**What can be told apart, and what cannot** (evidence and gaps):

- **A larger text setting can be detected.** The root font size reads larger than 16 px under a browser text
  setting or a user style sheet (`apps/web/src/lib/breakpoints.ts` `designedMinWidthPx()` already reads it;
  ADR-0213's M0 measured both routes).
- **Browser zoom can probably be detected in Chromium-family browsers**, where `window.outerWidth` is in
  screen pixels and `window.innerWidth` is in zoomed CSS px. This is not yet measured. Firefox reports screen
  sizes in zoom-scaled CSS px ([Mozilla bug 1292571](https://bugzilla.mozilla.org/show_bug.cgi?id=1292571),
  cited by ADR-0179), so there the two may look the same. **Only Chromium is installed in the build container**
  (`ls /opt/pw-browsers`: `chromium`, `chromium-1243`, `chromium_headless_shell-1243`), so behaviour in other
  engines cannot be checked here. The spec's M0 measures what Chromium reports and stops if it is not usable.
- **Pinch zoom is never involved.** It changes the visual viewport, not the layout box the scale reads.

**The smallest controls are 28 px.** `icon-sm` and `icon-row` are `size-7`
(`apps/web/src/components/ui/button.tsx:71`, `:91`). At a scale under 24 / 28 ≈ 0.857 they would render under
§2.5.8's 24 px. A reader's own zoom-out is exempt from §2.5.8; a scale the app applies is not.

## Decision

**D1 — The designed size is a 1280 × 800 CSS px browser window.** Every screen is designed and gated at and
above it. 1280 is the existing first promotion stage (`PROMOTION_STAGES`, 80 rem, `breakpoints.ts`), so the
toolbar's wide layout and the designed size begin at the same width. _(Pending spec question Q1: window or
screen.)_

**D2 — Below it, the plan workspace scales; nothing else does.**

- **What scales:** the plan workspace — the command band, the diagram, the Gantt, the activity panel, the dock
  and the foot row — as one unit. The app header, the Project Explorer, every other page, every form and every
  dialog keep reflowing at their real size, as today.
- **How much:** `scale = min(1, workspaceWidth / designedWidth, workspaceHeight / designedHeight)`, where the
  designed width and height are what the workspace's box measures in a 1280 × 800 window with the Explorer at
  its default width. The workspace is laid out at its box size divided by the scale, then drawn at the scale,
  so it fills its box exactly. The two designed numbers are measured at M0 and pinned by a test.
- **When it changes:** the scale is recomputed when the workspace's box changes size, never during a pointer
  drag (it waits for the pointer to be released, as the viewport banner does under ADR-0179 D4).

**D3 — The scale has a floor of 0.75, and nothing pressable renders under 24 px.** _(Pending Q2.)_

- 0.75 is what a 1024 × 600 window needs (600 / 800), so every window that met the old floor gets the designed
  layout, scaled.
- Below the floor the scale stays at 0.75 and the workspace behaves as it does today below the designed size:
  it scrolls, and the existing short-window rules apply inside it (D9).
- While the scale is under 1, the 28 px controls lay out at 32 px, so at 0.75 they render at 24 px. Every other
  pressable control is already 32 px or more.

**D4 — The scale never undoes the reader's own zoom or text size.** It is 1 whenever any of these holds:

1. **The text is enlarged.** The root font size is larger than 16 px, however that was done.
2. **The browser reports a zoom above 100 %.** How this is read, and in which browsers it is reliable, is
   decided by M0's measurement. A browser that cannot report it is covered by item 3.
3. **The reader chose actual size.** While the workspace is scaled, the foot row shows a small control,
   "Scaled to 88 %" (the live figure), which switches to actual size and back. The choice is kept on this device
   (ADR-0173's precedent), so a zoomed reader whose browser cannot report zoom makes it once. _(Pending Q3.)_

So zooming in never makes the workspace smaller and never leaves it the same size: in a browser that reports
zoom, the scale drops out as soon as the reader zooms; in one that does not, the control is one press away and
is remembered.

**D5 — Inside the workspace, layout questions are asked of the workspace's own box, not the window.** A media
query sees the real window, which is wrong inside a scaled workspace (at 1024 × 600 the window is "short" but
the workspace is laid out 800 high). So:

- the CSS variants used inside the workspace (`short`, `lg`, `xs`, `sm`, `wide` and the promotion stages) are
  answered by a container query on the workspace's layout box (ADR-0213's method, one level in);
- the code that calls `matchMedia` from inside the workspace (13 files app-wide today; the workspace's
  share is counted at M1) reads a workspace viewport context that answers in layout pixels;
- outside the workspace nothing changes.

**D6 — One mechanism, chosen by measurement.** The scale is applied once, on one wrapper, as a CSS transform or
as the CSS `zoom` property. M0 measures both in Chromium (pointer coordinates, element positions, resize
observers, canvas sharpness, menus anchored to scaled controls) and picks one. Either way:

- every pointer-to-diagram calculation goes through one helper that divides by the scale (today's sites use
  `e.clientX - rect.left`, for example `TsldCanvas.tsx:2445`, `:2599`, `:2900`);
- each canvas sizes its backing store to the pixels it is drawn at, so a scaled diagram stays sharp.

**D7 — Overlays keep their real size.** Dialogs open in the top layer and menus and tooltips are portalled to
the document body (`overlay-position.ts` `portalTarget()`), so they are never scaled. They stay anchored to the
scaled control that opened them; M0 confirms this.

**D8 — The viewport notice keeps its trigger and changes its words.** It still appears below 1024 wide, which is
where even the smallest scale cannot fit the designed workspace. Its copy states the designed size, 1280 × 800,
and says the plan view shrinks to fit below it.

**D9 — The short-window rules stay, for the windows that are not scaled.** A zoomed reader, a reader with larger
text, a reader who chose actual size, and any window under the 0.75 floor still get today's layout. So
ADR-0180, -0183, -0185, -0213, -0219 and the short-window offers keep working, now asked of the workspace's own
box (D5). Retiring any of them is a later decision, one rule at a time, each with a measurement showing it can
no longer fire or is no longer needed.

**D10 — Gates follow.**

- The designed sweep moves to 1280 × 800: the workspace's floor-state journeys assert the designed layout there.
- A scaled journey at 1024 × 600 asserts the workspace fills its box at scale 0.75, a click lands on the bar
  under the pointer, and axe's `target-size` rule passes.
- A guard journey asserts the scale is 1 under a 200 % browser text setting (CDP `Page.setFontSizes`) and under a
  user style sheet, and that the actual-size choice is honoured.
- The existing 1024 journeys stay, now covering the scaled band.

**D11 — No feature flag** (ADR-0088 D1). The actual-size control is the reader's way back; reverting the change
is the project's.

## WCAG reasoning

- **1.4.4 Resize Text.** D4 is the whole answer: the scale is 1 whenever the reader has enlarged text or the
  browser reports zoom, and the actual-size control covers browsers that do not report it.
- **1.4.10 Reflow.** The diagram and the Gantt are two-dimensional content, which 1.4.10 exempts; forms,
  dialogs and pages are not scaled and still reflow.
- **2.5.8 Target Size (Minimum).** D3 keeps every pressable control at 24 px or more as rendered.
- **Small text is a legibility cost, not a WCAG failure.** At 0.75, 12 px text renders at 9 px. WCAG sets no
  minimum text size; the owner accepts this as the price of fitting (Q2), and the reader can always zoom, which
  turns the scale off.

## Alternatives considered

- **Keep the 1024 floor and keep writing short-window rules.** The owner declined it; the context above shows
  why it stopped converging.
- **Scale from CSS px alone, with no zoom guard.** It cancels a reader's zoom up to 133 % at the 0.75 floor
  (1 / 0.75), and fails 1.4.4. Rejected.
- **Scale the whole app.** Forms and dialogs reflow well and would only get smaller; the owner limited it to the
  workspace.
- **Scale by changing the root font size.** It would scale every page, override the reader's text size, and miss
  the canvas painters, which draw in px. Rejected.
- **Detect a small device (`screen.width`).** Unreliable in Firefox (ADR-0179 already rejected it).
- **A floor of 0.86, so no control has to grow.** Windows under about 1100 × 690 would still need the
  short-window layouts. Offered to the owner as Q2's alternative.

## Consequences

- At 1280 × 800 and up nothing changes visibly. Most of the work is the gates moving and D5's conversions.
- Between about 1024 × 600 and 1280 × 800 the workspace shows the designed layout, smaller. **This includes
  many ordinary laptops:** a 1920 × 1080 screen at Windows' 125 % setting gives a browser window of roughly
  1536 × 730 (worked out from the 132 px overhead the owner measured, ADR-0179 D1), which scales to about 0.91.
- Readers who zoom or enlarge text get today's layout, short-window rules included. Those rules cannot be
  deleted yet.
- The workspace's layout code answers to its own box (D5). A new media query inside it is a defect; a
  structural test lists the allowed files, as ADR-0213 D4 does for `squat`.
- **Not verifiable in the build container:** Firefox, WebKit, real touch hardware and real browser zoom (headless
  Chromium has a text-size setting but no page zoom). D4 item 3 exists so that an unverified browser is still
  safe.

## References

- `docs/HANDOFF.md` ("What is next", item 1); ADR-0179; ADR-0118; ADR-0213; ADR-0092; ADR-0173.
- `apps/web/src/lib/breakpoints.ts`; `apps/web/src/components/ui/button.tsx`;
  `apps/web/src/features/tsld/components/TsldCanvas.tsx`; `apps/web/src/components/ui/overlay-position.ts`.
- WCAG 2.2 §1.4.4, §1.4.10, §2.5.8.
