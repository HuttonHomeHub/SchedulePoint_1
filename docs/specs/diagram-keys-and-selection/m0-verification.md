# Diagram keys and selection, M0: verification record

- **Date:** 2026-11-12. **Tree:** `origin/main` at web 1.3.0 (`962886f1`) plus the approved spec and plan.
- **Spec and plan:** [`feature-spec.md`](./feature-spec.md), [`implementation-plan.md`](./implementation-plan.md) (M0).
- **Harness:** one throwaway file, `apps/web/measure-toolbar/diagram-keys-m0.spec.ts`, run by the existing
  `playwright.measure-toolbar.config.ts`. A harness, not a gate (ADR-0081 §3): no CI step, no new config, nothing under
  `apps/web/src` changed. Raw readings: [`readings/diagram-keys-m0.json`](./readings/diagram-keys-m0.json).
- **What is real and what is not.** Real sign-up, real API on a real Postgres, real Chromium in this container, mouse
  through `page.mouse`, touch through Playwright's touch emulation (`hasTouch`, `touchscreen.tap`). The one thing injected
  is the **prototype of M1's focus move** (a `document` listener that calls `list.focus({ preventScroll: true })` when the
  press's target is the scene canvas; on `document` so it runs after React's own handler, which is the order M1 builds).
- **What was NOT verified, plainly.** The plan asks for Chromium, Firefox and WebKit. **Only Chromium is installed in this
  container** (`/opt/pw-browsers`), and `playwright install` was not run, so **Firefox and WebKit are unverified**, and so
  is every real device (a Surface touch screen, a stylus, a screen reader). Touch here is an emulation, not hardware.
  The journeys M1 adds run on Chromium like the rest of the estate (`docs/TECH_DEBT.md` #25a); the three-engine check is
  owed to whoever next has the browsers.
- **How a run is invoked:** `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome scripts/e2e-local.sh measure:toolbar -- diagram-keys-m0.spec.ts`.

## Summary, in plain English

The spec's picture of the key problem is right, and the fix it recommends works in Chromium, with **one change to how it
is built (focus on `click` as well as on release, for touch)**. One neighbour claim is **wrong in a way that widens it**:
Ctrl-click fails whether or not the pen is held. Nothing found stops M1.

## Readings, premise by premise

| Check (plan M0 step)                   | Premise                                                        | Reading (Chromium, 1024 × 600 unless stated)                                                                                                                                                                                                                                                                                                                  | Verdict                                                       |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Focus after a press (P1.2)          | A press on the canvas leaves focus on `<main>`                 | After a click on a bar, after a drag of a bar, and after a click on empty foot-row space: `document.activeElement` is `main#main`, an **ancestor** of the workspace root (`containsWorkspaceRoot: true`).                                                                                                                                                     | **Holds**                                                     |
| (same)                                 | The keys are dead after a pointer press                        | After a mouse click on a bar: Ctrl+Z did not undo (the bar's version stayed at 2 after its drag), Ctrl+C then Ctrl+V left the count at 3 of 3, and Escape left the selection at 1 option.                                                                                                                                                                     | **Holds** (P1.1, P1.3, P1.4)                                  |
| 2. A focus move on release             | `listbox.focus({ preventScroll: true })` after a press sticks  | **Mouse:** focus on the list at the click and 400 ms later; `main.scrollTop` 0 before and after; after a drag of a bar and after an empty-ground pan the list also holds it. Escape then clears the selection and announces "Selection cleared."                                                                                                              | **Holds for mouse**                                           |
| (same, touch)                          | The same for a tap                                             | **A focus on `pointerup` does not stick for touch**: after a tap the browser's compatibility `mousedown` (sent after `pointerup`) moved focus back to `main#main`. **A focus on `click` sticks** (list focused after the tap; one `pointerup`, one `click`).                                                                                                  | **Changes the build**, see below                              |
| (same)                                 | `click` fires after a drag on the captured canvas              | After a drag of a bar and after an empty-ground pan, the scene canvas received `pointerup` 1 and `click` 1.                                                                                                                                                                                                                                                   | Holds                                                         |
| (risk 1)                               | The list's `onFocus` selects row 0 after an empty-ground press | With nothing selected, an empty-ground click followed by the focus move left **row 0 ("Alpha") selected** (`selectedOptions: 1`). Without a suppression the move invents a selection.                                                                                                                                                                         | **Holds**, so the suppression flag is required                |
| 3. `dblclick` reaches the canvas (D-f) | Mouse and touch                                                | Mouse: 1 `dblclick` on the scene canvas. Touch: two taps 60 ms apart gave `pointerup` 2, `click` 2, `dblclick` 1.                                                                                                                                                                                                                                             | **Holds** (emulation)                                         |
| 4. Ctrl-click (P4)                     | The replace happens with the pen and not without it            | **Pen held:** Ctrl-click leaves 1 option selected (the second bar); Shift-click leaves 1. **No pen:** Ctrl-click **also** leaves 1; Shift-click leaves 2 (works).                                                                                                                                                                                             | **Partly wrong**, see below                                   |
| 5. Delete (P2)                         | No Delete key; the button confirms                             | Delete with the list focused: no dialog, count unchanged. The selection bar's Delete button opens an `alertdialog` ("Delete “Alpha”? You can restore it later.").                                                                                                                                                                                             | **Holds**                                                     |
| 6. Gantt                               | A click on a Gantt bar leaves focus where the root hears it    | After a click on a Gantt bar focus stayed on the **"Gantt" view toggle**, a button in the portalled toolbar (inside the React tree, so the root handler hears it). The bar's press does not move focus, so the keys work in the Gantt only while focus is already on a control in the workspace's React tree, and are dead if it was on `<main>` or `<body>`. | **Holds, with the same gap**: M1's widened fallback covers it |

## What changes in M1 because of these readings

1. **The focus move happens on `pointerup` and again on `click`** (both guarded the same way, a no-op when the list already
   has focus). `pointerup` alone loses to the touch compatibility `mousedown`; `click` alone would lose a mouse release
   that ends outside the canvas. Neither is a premise failure: the spec says "on release" and flagged touch as an M0 check.
2. **The row-0 suppression is required**, not a precaution (risk 1 reproduced).
3. **Ctrl-click (M4) is broader than the spec says.** Reading `TsldCanvas.tsx:2786-2800`: Ctrl arms the gesture machine
   (`marqueeArmable`) for every reader, and `canReposition` is always wired (`plan-workspace-toolbar.tsx:1655`), so a
   Ctrl-press on a bar becomes `repositioning` whether or not the pen is held, and its unmoved release calls `onSelect(id)`
   with no modifier (`TsldCanvas.tsx:2997`). Shift-click is lost only while the pen is held (the machine runs only when
   editing). M4's fix (carry the modifier through the machine) stays the same; its journey should assert Ctrl-click with and
   without the pen, and Shift-click with the pen. The spec's P4 text and `docs/HANDOFF.md`'s "worked at 8.4" are corrected
   in the spec in this commit.
4. Nothing else in the plan changes. No premise that gates M1 was disproved.
