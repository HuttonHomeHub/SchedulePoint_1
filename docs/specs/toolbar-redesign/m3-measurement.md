# Toolbar redesign — M3 measurement record

Taken 2026-10-09 on the M3 build by `apps/web/measure-toolbar/toolbar-redesign-m3.spec.ts` (a harness, not a
gate; ADR-0081 §3), fine and coarse pointers, the container's Chromium, a plan with a long name
("Riverside Quarter — Phase 2 Substructure"). Band = header + deck line + 3 px rule. "Held" = the shell does not
scroll (`squat` false); "scrolls away" = `squat` true, the shell scrolls and `<main>` is a full `100dvh`.

## 1. Pre-M2 check (the orchestrator's question)

Clean worktrees, no stash. At `0c26cb2` (the last M1 commit, before M2): narrow-shell "foot row wraps… rows under the
swap" **failed** (700 × 900: 3 rows, expected ≥ 5) and activities-panel-scroll case 7 at 700 × 900 **failed** ("Diagram
hidden" note not shown). A third narrow-shell case, "every dock opens…", also failed there (an icon-only Comments
tooltip, opened by the press, covers the next control — M1's tooltips). At `6949c10` (before M1) all three **passed**.
So none is M2's, and none was M3's: all three came with M1. The cause of the first two is not a defect: M1's icon-only
labels shortened the wrapped deck, the body grew, and 700 × 900 stopped being a short body, so nothing swaps. M3 makes the
band one line (body 757 px at 700 × 900) and the premise is gone for good, so those journeys now read the heights where the
body is short (740 px: 597 fine / 577 coarse, under the 611 px `isShortBody` line). `plan-switch` "opening another plan with
the pen held recalculates nothing" and `zero-duration` "converts from the selection bar" (foot row 87, expected 51, at 1646) also fail at `fe0afcd`, before M3: not M3's.

## 2. #471's five cells and the neighbours

| Cell (fine) | Header | Band | Share | `<main>` top | Squat | Expand at rest | Expand after scroll |
| ----------- | ------ | ---- | ----- | ------------ | ----- | -------------- | ------------------- |
| 640 × 480   | 88     | 143  | 30 %  | 143          | no    | yes            | yes                 |
| 640 × 360   | 88     | 143  | 40 %  | 143          | yes   | no             | yes                 |
| 640 × 300   | 88     | 143  | 48 %  | 143          | yes   | (scrolled)     | yes                 |
| 320 × 720   | 184    | 239  | 33 %  | 239          | no    | yes            | yes                 |
| 320 × 256   | 184    | 239  | 93 %  | 239          | yes   | no             | yes                 |

Coarse: headers 100 / 212, bands 163 (34 %, 45 %, 54 %) and 275 (38 %, 107 %), same squat cells, Expand hit-testable
after scrolling at all five (**unreachable at all five before**). Before M3: bands 355 / 603 px.

- **SC-5 is met by "scrolls away" at the three short cells and by ≤ 40 % at 640 × 480 and 320 × 720**, on both pointers.
- **The owner's `<main>` y targets are met on a mouse at 640 (143 ≤ 150) and missed at 320 (239 > 200) and on touch (163, 275).**
  Cause at 320, below: the header, not the deck. The deck line is 52 px (fine) in every cell below 1024.
- The deck is **one line** (every control on one top) and overflows (about 1,970 px of line in 640 px fine, 2,300 coarse).
  The far edge fades by 2 rem at rest (`--deck-fade-end` 32 px) and the near edge by 0; both follow the scroll; one control
  is cut at the edge at rest.
- **1280 × 600, 1366 × 768 and 1280 × 800 keep their two rows** (fine 2 lines, band 139; coarse 3 lines, band 211), with no
  sideways scroll and no fade (CQ-3).
- Text-only 200 % (root 32 px) at 1280 × 800 = 40 × 25 rem: squat, one line, band 283 px (35 %) fine and 323 (40.4 %)
  coarse, **scrolling away** both; before: 707 (88 %) and 1019 (127 %). Every deck control and Expand and Recalculate are
  hit-testable after scrolling to them, on both pointers (journey).

## 3. What the 320 cells found that the plan did not name

At 320 the header's brand, status badge and the M2 "Plan details" toolbar are 316 px against 288 of row, so **Edit plan
details was laid out at x = 322, outside the window** (and the shell, `overflow: hidden`, could be scrolled sideways by a
programmatic scroll to it). It came with M2's second button. `app-header.tsx` section 1 now wraps below 26 rem (`max-xs:`),
which puts the identity under the brand: header 136 → 184 px (fine) and the 320 band 191 → 239. At 640 the same content
truncates the plan name and fits, and a wrap there cost 48 px, so the step is `xs`, not `lg`. **Open for the owner:** this is
why `<main>` starts at 239, not ≤ 200, at 320; reaching 200 means choosing between hiding the status badge, an icon-only
brand, or moving the identity beside the view switch, all header decisions.

## 4. The selection bar at 1024 × 600, now that Float paths is icon-only

Fine: bar 323 px wide, **4 lines**, 11 items, Float paths 32 px, foot row **167 px**, canvas 246. Coarse: bar 319 px, 5 lines,
Float paths 44 px, foot **247**, canvas 200. The foot row is the same 167 px M0 §2 recorded for a selection (51 → 167): the
bar's width is set by the outlet column (the 582 px facts block beside it is `shrink-0`, `docs/TECH_DEBT.md` #471's separate
paragraph), not by its contents, so the icon-only Float paths did not change the line count. Unchanged by M3 (≥ 1024).

## 5. Shared keyboard/focus change (ADR-0111), exactly

`Deck` only. `Toolbar`, `Menu`, `ToolbarPopover` and `usePopoverPanel` are unchanged (overlay clamp tested, not edited).

1. New `onFocus` on the deck root: for a `[data-toolbar-focusable]` target, if the deck overflows
   (`scrollWidth > clientWidth`) and the focus is keyboard focus (`:focus-visible`, or a roving move `Deck` made itself),
   call `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. A pointer press does not scroll.
2. `onKeyDown`'s `nodes[next].focus()` passes `{ preventScroll: true }` **only when the deck overflows**, so the one scroll
   is (1)'s; a `rovingMove` ref marks the move as keyboard. At 1024 and up nothing changes.
3. CSS: `max-lg:` nowrap/overflow line, `scroll-px-8` (the fade's 2 rem), `deck-edge-fade` mask.
   Key sets, veto rules, roving order, Tab stops and the focus handoff are untouched.

## 6. Red first

- Focus walk: with the overflow gate forced false the journey fails at step 7 (Filter), "clear of the trailing edge",
  received −54.5 px against ≥ 7.5.
- The SC-5 deck assertions (one line, overflows) fail by construction on the pre-M3 deck (6 to 11 wrapped lines, no overflow).
- The swap journeys failed before M3 for the reason in §1.
