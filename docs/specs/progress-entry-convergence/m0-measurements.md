# M0 — measurements

Taken 2026-08-13 in Chromium at **1646 × 1097** (the product owner's Surface Pro, 2880×1920 @ 175%),
signed in, pen enforced at the API, every `VITE_` flag at its default — i.e. the surface a published
image actually produces (ADR-0088 D1).

**Method.** A throwaway spec, `apps/web/e2e-workspace-chrome/m0-evidence.spec.ts`, driving the real
product: sign up → organisation → client → project → plan → three seeded activities via the public
REST API → recalculate. It measured and printed; it asserted almost nothing. Deleted once this file
held the numbers, which is why the numbers are here rather than in a test name.

Run:

```
PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @repo/web exec playwright test \
  --config playwright.workspace-chrome.config.ts m0-evidence --reporter=line
```

---

## M0-T1 — the plural-selection finding: **CONFIRMED, and softer than the spec claimed**

The spec derived this from four files and flagged it as unobserved. Driven in a browser:

| Selection        | Dock singular bar | Command surface `update-progress`                 |
| ---------------- | ----------------- | ------------------------------------------------- |
| one activity     | present (1)       | present, `aria-disabled=null` — **enabled**       |
| three activities | **absent (0)**    | present, `aria-disabled=null` — **still enabled** |

So the derivation was right: the ADR-0092 guard suppresses the singular dock bar at ≥ 2 selected,
and the command-surface item stays enabled because the host's selection state is the primary id.

**But the spec called it a defect, and that is an overstatement — corrected here rather than left
standing.** The plural bar prints, in the reader's own words:

> "3 activities selected — “Cladding” is the subject of single-activity actions."

The product therefore _does_ name the rule, on screen, at the moment it applies. This is an
inconsistency between two surfaces, not a silent action on an unnamed subject. The removal still
resolves it, and it is still worth having resolved; it is not the defect the spec implied.

Checked, because removing the item could have made that sentence false: it does not.
`add-note`, `clear-visual-placement` and `float-paths` are also selection-gated and remain, so
"single-activity actions" still has referents during a plural selection.

## M0-T2 — Row 2 at 1646: **no label was gained. Say it in those words.**

|        | Inline | Labelled | `⋯` present |
| ------ | ------ | -------- | ----------- |
| Before | 13     | 11       | **yes**     |
| After  | 13     | 11       | **no**      |

Item sets:

```
before  add-activity, link-tool, marquee-select, auto-arrange, add-note, recalculate,
        undo, redo, analysis, calendar, update-progress, comments, export
after   add-activity, link-tool, marquee-select, auto-arrange, add-note, clear-visual-placement,
        recalculate, undo, redo, analysis, calendar, comments, export
```

**The width argument is withdrawn**, per the plan's own instruction. Removing the item did not free
a label: the counts are identical either side. `update-progress` was labelled before the change, so
its 163 px went straight back into the ladder and was spent immediately.

**What did change is worth more than the argument it replaces**, and no reasoning would have
produced it. `clear-visual-placement` had been demoted into the overflow menu; with one fewer plain
button competing it comes back inline, and the **`⋯` trigger disappears from Row 2 altogether**. At
1646 every Row 2 command is now directly reachable, with no menu in the way — which is the shape
ADR-0091 M7's degradation ladder exists to produce and had not reached at this width.

One honest consequence, since it interacts with the spec's Q2: the command promoted into the
vacated slot, `clear-visual-placement`, is one of the two write affordances still reachable from a
**Gantt** selection. This change makes it more prominent, not less. That does not alter Q2's
disposition — it goes to the Gantt-editing epic either way — but it should not be discovered there
as a surprise.

Row 1 is unaffected (11 inline / 10 labelled, `⋯` present, both before and after), as expected: the
item was never on it.

## M0-T3 — the route census in the Gantt: **the Q1 acceptance holds**

The product owner accepted the Contributor-in-Gantt cost on the stated basis that the
activities-table row menu reaches progress there. It does:

```
[T3] gantt: dock singular bar: 0                     ← the dock is canvas-only, as designed
[T3] gantt: "Expand activities panel" present: 1
[T3] gantt: activities panel region present: 1
[T3] gantt: row menu for "Dig footings": 1
[T3] gantt: row menu items: Logic | Report progress | Resources | Steps | Edit | Duplicate | Delete
```

The acceptance rests on a true premise and does not go back to the product owner.

**The first run of this task measured the wrong control and would have reported a false pass.**
`getByRole('button', { name: /actions for/i })` matched **six** elements — the Project Explorer
rail's row menus — and returned `New project | Rename | Delete`. Scoping it to the activity's own
name (`Actions for Dig footings`) is what made it the activities table. Recorded because the
failure mode is the one this epic is about: a reading that looks like evidence, of the wrong thing.

---

## Two corrections to the harness, both found by running it

1. **Ctrl+click does not build a plural selection on the canvas.** `TsldCanvas.tsx:1601` maps
   Ctrl/Cmd to `'toggle'`, but `:1716` _also_ starts a marquee on a Ctrl pointerdown, so a
   ctrl-click is a toggle and a zero-size sweep at once and the net selection stayed at one. The
   evidence spec used `Ctrl+A` on the parallel listbox instead — the documented select-all
   (ADR-0080) and unambiguous. Not a product defect: no assertion here depends on ctrl-click being
   a toggle, and the marquee is reached by its own tool. Worth knowing before writing the next
   canvas journey.
2. **The bulk bar's text is "N activities selected", not "N selected".** A regex written from
   memory matched nothing and timed out. It carries `data-testid="bulk-selection-bar"`; use that.
