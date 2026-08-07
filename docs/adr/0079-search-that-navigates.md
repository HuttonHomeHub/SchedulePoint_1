# ADR-0079 — Search that navigates: the find cursor, the Escape rule, and zoom-to-selection

- **Status:** Accepted (M0–M5 landed; `VITE_CANVAS_SEARCH_NAV` default-on 2026-08-07)
- **Date:** 2026-08-07
- **Spec:** [`docs/specs/canvas-search-navigation/`](../specs/canvas-search-navigation/)
- **Amends:** ADR-0064 (the tool-mode Escape contract), ADR-0032 M5, ADR-0056 (preset vocabulary),
  ADR-0059 (the Gantt as a peer view)
- **Supersedes:** nothing

---

## Context

The TSLD toolbar's search field **filtered and did not find**. Typing dimmed the non-matching bars
and left the planner to spot the survivors themselves — on a 2,000-activity programme at the Week
preset, that is scrolling a wall looking for something that is not greyed out. Every other cycle in
the product already worked the other way: **Next conflict** centres, selects and announces each
member of its set in turn. Search was the one live-derived set with no way to walk it.

The number that decides this is not the feature's, it is the plan's: `packLanes` gives a
500-activity import 60–80 lanes, and the canvas shows about a dozen at the Day preset. A planner
who knows the activity's name has no route to it that does not involve looking.

## Decisions

### 1 — One ordering, shared with the conflict cycle

`render/ordering.ts` holds `compareByTimeThenLane` (early start → lane → id, nulls last), extracted
from `conflicts.ts` and consumed by both. Two cycles walking the same plan in different orders
would agree on ordinary plans and differ exactly where a planner is looking hardest, and the only
way to notice would be to compare two toolbar buttons against each other. The extraction's proof is
that **the existing conflicts suite passed unchanged**, which was an acceptance condition of the
task and not a hope.

### 2 — One matching predicate, and it is not new

`orderedMatches` imports `matchesActivityFilter` from `lenses.ts` rather than re-deriving it, so the
set Enter walks is by construction the complement of the set the canvas dims. A structural test pins
that `search-matches.ts` defines no predicate of its own — the ADR-0065 `routeOrthogonal` rule
applied one module along.

### 3 — Enter cycles, and **focus never moves**

`goToMatch` centres, selects and announces `Match <i> of <n>: <name>.` — the same shape as
`goToNextConflict`, one predicate along. It selects with `focusListbox: false`, which is the whole
difference between a find control and one that works exactly once: the planner is still in the
field, and moving focus out would mean re-reaching for it before every subsequent match.

### 4 — **An Escape typed into a text field belongs to that field**

This is the load-bearing decision, and it **amends ADR-0064**. The canvas's Escape handler is a
native `window` listener, so it fires wherever focus is — and with a tool armed, a planner refining
their search query lost the tool to a keystroke they had aimed at the text. That is precisely the
defect class ADR-0064 was opened on, arriving through a door that decision did not have.

The mechanism is a **target guard**, not `stopPropagation` from the field. The toolbar is portalled
into the chrome band (ADR-0055 S2), so whether a React handler's `stopPropagation` reaches a
`window` listener depends on the native bubble path through the portal target — an assumption the
spec explicitly refused to make (C15). The guard needs no such assumption and is the third consumer
of a pattern `use-plan-workspace-key-scope.ts` already uses for `?`.

The guard is about **text entry**, not about "anything that is not the canvas": Escape on a toolbar
button does not mean "undo my typing", so the tool contract still applies there. A guard written as
`target !== canvas` would have taken that away silently, and there is a test for it.

**The accepted consequence, and the step that makes the guard safe rather than merely quiet:** with
focus in the field, Escape can no longer disarm a tool. So the field takes a **two-step Escape** —
first clears the query (announced), then hands focus to the diagram's listbox. The way out is two
Escapes rather than none, which is the same two-step the Link tool already uses for a wrong
endpoint. Without step 2 the guard would be a **dead end** for anyone driving from the keyboard, and
a rule that removes the only route to a behaviour is not a scoping decision, it is a defect.

### 5 — One keystroke says one thing

The debounced filter count and the jump speak into the **same** polite live region. The count now
stands down once a search cursor exists; typing again clears the cursor, so the count returns for
the phase it is actually for — refining the query, before any jump. Clearing the search says
**"Search cleared."** rather than blanking the region, and that message is owned by the panel's own
active→inactive transition, which is the only place that can see both routes into it (the field's
Escape and the Clear button).

### 6 — Zoom to selection frames what you landed on

A fourth viewport command, capped at the ADR-0056 **Day** preset with a 14-day minimum context
window, so the result lands inside the preset vocabulary and the preset control can name it. It is
shaded with a reason in the Gantt (no canvas handle, so no command) rather than lit and inert — the
ADR-0059 M6 defect, guarded in the first version rather than fixed in a later one.

### 7 — Both views walk one match set

The matched ids are derived **once**, in the workspace, and handed to the canvas and the Gantt.
Cycling in the Gantt scrolls the row into view without moving focus. The cursor survives a view
switch, which is the point: it is one search, seen two ways.

## Consequences

- **The CPM engine is not imported.** The ADR-0034 recalculation parity gate is untouched by
  construction — this changes what the client asks for and what it says, never what the server
  computes.
- The flag-off parity suites (`tsld-toolbar-search-nav.flag-off.test.tsx`) are **kept and pinned**
  at the flip, per the ADR-0053 M6 rule. A parity suite relaxed on the day the flag flips is not a
  rollback contract, it is a comment.
- `VITE_CANVAS_SEARCH_NAV` is **derived** from `VITE_CANVAS_LENSES` (the ADR-0062 precedent): a
  build with navigation on and lenses off would bind Enter to a disabled placeholder input.

## What the journey found, and why it is recorded here

The flag-on journey (`apps/web/e2e-search-nav/`, its own CI step) failed on its **first run**, twice
over, on defects no unit suite in this repository could have reported:

1. **§4 had never been implemented.** The spec specified the guard; the milestone that owned it
   shipped without it, and every green unit suite stayed green — because the component tests mount
   the toolbar alone and cannot see a native `window` listener at all.
2. **The jump announcement was overwritten by a stale count** four jumps in. Both timers are
   correct in isolation; only a real browser runs them against each other.

Three of the journey's own assumptions were also wrong, and each correction improved the test:
`canvas.press('Escape')` leaves focus in the field (so the suite now drives the documented two-step
route end to end, which is the better assertion); the plan already opens at the Day preset (so
zoom-to-selection is driven from a coarse preset, or the assertion would pass with the command doing
nothing); and the cursor deliberately survives a view switch.

This is the ADR-0067/ADR-0064/ADR-0070 shape for the fourth time: **a correct pattern applied to one
control and not its neighbour, invisible to every gate that does not run the real thing.**

## Filing note

This ADR is **0079**, not the `0078` its own implementation plan names. `0078` was taken by canvas
module boundaries between the plan being written and the milestone landing. The plan's M5-T3 warned
about exactly this failure — ADR-0071 was cited by number in shipped code for a whole epic before
anyone noticed it had never been filed — so the collision is recorded here rather than routed
around, and the spec and plan are corrected in the same commit.
