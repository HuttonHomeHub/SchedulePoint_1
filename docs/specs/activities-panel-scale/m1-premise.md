# M1-T1 — the browser premise, and what this session could not check

**This is not the browser probe the plan asked for.** M1-T1 says: confirm §4.1's two claims in
Chromium with a throwaway probe, photograph the header rule while pinned in Chromium/Firefox/WebKit,
and measure the header's real height before picking a `scroll-pt-*` step. This session was
instructed **not to run Playwright**, so none of that ran. What follows is the reasoning the
implementation went ahead on instead, labelled the way `ADR-0083`/`ADR-0122` label an unverified
claim — **reasoned from specification, not observed** — and it is owed a real run before anyone
treats it as settled.

## (a) and (b): does `sticky top-0` pin on the current structure?

**Not re-verified, but not newly assumed either.** §4.1 already gives the CSS-specification
argument (`position: sticky` sticks within its nearest **scrollport**; the current region never
scrolls vertically — an ancestor does — so a sticky header on it would stick to a box that never
moves) and the Gantt's own shipped code (`GanttPanel.tsx:1072`, `bg-background sticky top-0 z-20`)
is the same pattern working today, inside a scroller it owns. Both point the same way. The one
thing a probe would add is proof rather than inference; it did not run.

## Header-rule survival under `border-collapse` + `sticky`

**Genuinely unverified, and taken conservatively.** The spec names this as the one item that
needs a three-engine screenshot before choosing between (a) `border-separate` with the rule moved
to each `<th>`/`<td>`, or (b) keeping `border-collapse` if all three engines carry a `<tr>`'s
border through a sticky cell. **Option (a) is what shipped** — the spec's own stated default "if
any engine fails (b)" — because nothing here confirmed (b) holds anywhere, let alone in three
engines. The cost, if a real check later finds `border-collapse` behaves fine everywhere: reverting
to a `<tr>`-level border in `'contained'` mode is a smaller diff than what shipped, not a rewrite.

## Sticky on `<thead>` vs. per-`<th>`

Shipped **per-`<th>`**, the spec's stated default ("widest support"), without a browser check.

## The `scroll-padding-top` value

**This is the item most worth a real measurement**, because SC-3 (a focused control never lands
entirely behind the pinned header) depends on it directly, and the harness cannot substitute for a
rendered layout here.

Reasoned from the token values actually in play (`globals.css`): the header `<th>` uses
`py-2 pr-4 font-medium text-sm` — `text-sm` is `line-height: 1.25rem` (20px) at the unmodified root
font size (no `html { font-size }` override exists in this stylesheet), `py-2` is `0.5rem` (8px)
top and bottom, giving roughly **36px of content-box height before the row's own border**. Tailwind
Preflight's `border-collapse: collapse` on the ordinary (`'page'`) table means a shared 1px border
does not simply add a whole pixel on top of that; `'contained'` mode moves to `border-separate`,
where the `<th>`'s own `border-b` **does** add a plain 1px. So the honest estimate is **~36–37px**,
with a wider margin than that reserved because font metrics are not identical across engines and
this was never rendered to check.

`scroll-pt-12` (`3rem` = 48px) is what shipped — a Tailwind **scale step**, not an arbitrary bracket
value (the sizing-ratchet rule this repository's docs describe), chosen with roughly 11–12px of
headroom over the reasoned estimate rather than the tightest step that clears it (`scroll-pt-10`,
40px, would leave only 3–4px). If a real measurement later shows the header taller than 48px — an
unusually large system font, say — SC-3's journey assertion (Shift+Tab through every row, checking
the focused rectangle is never wholly inside the header's rectangle) is exactly the thing that would
catch it, and the fix is a one-line constant change.

## `PANEL_MIN_OPEN` (140px) vs. the scroll padding

Not in question either way: 48px of scroll padding is comfortably under the 140px minimum panel
height regardless of which header-height estimate is right, so this risk does not interact with the
one above.

## What is owed

A real run of M1-T1's probe — in Chromium, Firefox and WebKit, against the actual rendered header —
before this file's reasoning is treated as more than a placed bet. The M1 journey
(`apps/web/e2e-workspace-chrome/activities-panel-scroll.spec.ts`) exercises SC-2/SC-3/SC-5 in a real
Chromium and is the nearest thing to that check this session could still provide honestly: it is
**written and its red-run recipe is recorded**, but it was not run here either (same constraint).

## What was then run (2026-09-28, central)

The M1 journey was run in **Chromium** against the real rendered layout
(`playwright.workspace-chrome.config.ts`, `activities-panel-scroll.spec.ts`): all three cases pass,
including SC-3's walk of Shift+Tab through real rows at 1646 and 1920, which asserts no focused
row lands wholly behind the pinned header. So `scroll-pt-12` holds in Chromium, observed. Red run:
the pre-M1 structure (with only the test id added, so the failure is about behaviour and not about
a missing locator) fails SC-5 at 1646 — the panel body scrolls, `scrollHeight` 2753 against
`clientHeight` 176. **Firefox and WebKit were not run**: neither browser is installed in the dev
container, so the cross-engine border question stays on the `border-separate` safe default and is
CI's to answer (it runs this suite in Chromium only, `docs/TECH_DEBT.md` #25a). The two journey
fixes the first run needed (build the plan before narrowing to 390, and a raised rate limit for
this harness) are in the commit that recorded this.
