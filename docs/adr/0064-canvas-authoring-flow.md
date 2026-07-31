# ADR-0064: Canvas authoring flow — the tool-mode contract and recalculation quiescence

- **Status:** Accepted (M1–M3 landed + the enablement review folded; `VITE_CANVAS_AUTHORING_FLOW`
  and `VITE_CANVAS_LINK_ROUTING` default-on 2026-07-31)
- **Date:** 2026-07-31
- **Spec:** [`docs/specs/canvas-authoring-and-routing/`](../specs/canvas-authoring-and-routing/)

## Context

The canvas is the product's primary editing surface, and its primary act is creating logic. A
driving session found that act unreliable: **six link attempts produced zero dependencies**, and one
link was reported as having recorded its endpoints the wrong way round.

The second report is the interesting one, because the code says it cannot happen. The gesture
reducer maps the **first** click of a two-click pick to the predecessor, and no path in it inverts.
So either a click was not becoming a pick, or the scene was moving between the clicks — and those
are different defects with different fixes.

## Decision

### 1. Diagnose before fixing, and record "not reproduced" as an answer

`apps/web/e2e-authoring-flow/link-direction.spec.ts` drives the two-click pick against a real API
with the pen enforced and the coalesced auto-recalculation live, sweeping the inter-click delay
across the 500 ms debounce boundary — quiescent, and with a recalculation genuinely in flight.

Every click point is **measured**, not assumed: the harness walks one canvas column in `select`
mode reading the canvas's own parallel listbox, then re-probes the same pixels after the pick. That
is what makes the candidate mechanisms distinguishable — no row means a click was dropped, a
reversed row with a _changed_ map means the scene moved, a reversed row with the map intact means
something else again.

**Every case recorded exactly one dependency, in click order, with the map unchanged.** The
reversed link is closed as **unreproduced**, not as fixed. Recording "fixed" for a defect nobody
explained is the failure ADR-0058 exists to name.

What _is_ explained is the zero dependencies: the Link split-button's primary region opened its type
menu and armed **nothing**, so a planner who clicked "Link" and then clicked two bars was still in
**Add** mode and drew two activities. That is also the shape most likely to be reported as a
reversal — the click sequence the planner counted was not the sequence the machine received.

### 2. One arm/disarm contract, shared by every tool

Arming a tool is the most consequential state on the surface: it decides what the next click
_means_. It is therefore uniform across all four modes rather than per control.

- Both split-buttons are **true split buttons**: the primary region arms and disarms; the caret
  opens the type menu. Add previously did neither, so two adjacent controls did different things on
  the same click.
- **Escape** returns to `select`. `link`'s open pick takes the first Escape and the tool the second
  — a wrong endpoint should not cost you the tool.
- Arming and closing are **announced**. The canvas is `aria-hidden` (ADR-0026 D7), so the change was
  otherwise conveyed only by a label on a control you may not be looking at.

**The spec's `[VERIFIED]` claim that Escape did nothing for the Add tool was wrong.** The component
test was written to fail on it and passed on the first run; the browser agrees. The real gap was
narrower — no way out from the toolbar at all.

### 3. State the armed tool, the open pick, and the created link

A compact band in the **chrome above the scene** — never an overlay on it. The canvas already
carries an ADR-0054 cursor chip, an ADR-0056 Today pill and an ADR-0031 floating selection bar; a
fourth overlay eventually comes to rest on the bar the planner is trying to click. That is not
hypothetical: it is how this epic's own test harness failed once.

The band names the picked predecessor mid-pick, and confirms a created link with its **direction**
(`Linked "A" → "B" (FS)`) plus an Undo calling the existing ADR-0048 inverse. Direction matters
because "linked A and B" would have been equally true of the reversed row the epic opened on.

Its sentence comes from an exported pure function that the live-region announcement also calls, so
the spoken and printed wording cannot drift.

**The confirmation is scoped to the arming that produced it.** It carries the generation of the Link
arming it was created in, and renders only while that is still current. The first attempt used the
armed _tool_ as the guard, which reads as equivalent and is not: the field was always `'link'` and
only ever read inside a `mode === 'link'` branch, so it could never be false. The effect was that
after one link, **every later arming replayed that confirmation** — beside an Undo bound to the top
of the command stack, which by then was a different, more recent edit. A sentence naming one link
next to a button that discards another is worse than saying nothing. Found by the enablement UX
review (§7).

**Every pick step is announced, whichever device made it.** The pointer path was originally wired to
a raw state setter while the keyboard path announced inline — so the two disagreed about whether
anything had been said. Both **drop** routes share that callback, and one of them (the §4 cap) fires
with no user gesture at all: a screen-reader user mid-pick learned nothing, and their next Enter was
read as a fresh predecessor rather than the successor they meant. The LOE tool's equivalent handler,
twenty lines away, had been right since Stage D. WCAG 4.1.3.

### 4. Recalculation quiescence during an open pick

A coalesced recalculation landing between the two clicks moves the bars, and the second click lands
on a different activity than the planner aimed at. `usePlanAutoRecalc` gains `hold(token)` /
`release(token)`.

- **Token-based**, not a counter: a stray release from one surface cannot open the gate on another's
  pick.
- **Capped** at `AUTO_RECALC_HOLD_CAP_MS` (10 s), measured from the _first_ hold. The thing holding
  is a human gesture; someone who picks one endpoint and walks away must not leave the plan's dates
  stale for the session. At the cap the recalculation fires, the open pick is dropped, and the
  planner is told.
- **Released in an effect cleanup**, so every exit path — including ones nobody has thought of yet —
  releases by construction rather than by remembering to. A leaked hold does not fail loudly; the
  dates simply stop updating.
- **No hold ⇒ today's cadence, unchanged.**

### 5. Keyboard parity, and an empty state

Enter on the focused activity picks the predecessor and commits on a different one, mirroring the
pointer exactly — and the pick is seeded _into_ the canvas's gesture (the `loePickStartId`
precedent), so the keyboard and pointer paths are one pick rather than two notions of it. Enter
outside `link` mode still opens the Logic tab.

An empty plan names the first gesture, with the affordance **shaded and explained** without the pen
rather than hidden — a Viewer who cannot see it cannot tell "empty" from "not allowed" (ADR-0062 M6,
twice).

### 6. The flag split

The **defect fixes** ship unflagged; the **additive surface** ships behind
`VITE_CANVAS_AUTHORING_FLOW`. Gating the fixes would mean writing parity suites that pin a bug, and
keeping two copies of the mode logic in one file — which ADR-0061 rejected for the dialog refactor.

### 7. The enablement review is part of the milestone, not a formality

Five specialists ran over the combined diff before the flags were trusted: ux, accessibility,
component, performance (passed) and test-engineer. Four blocked, on **five** defects that had passed
a human read — the stale confirmation and the silent pointer picks above, plus `restoreFocusRef`
pointing both new split buttons at their `tabIndex={-1}` caret (so a keyboard user's next Tab left
the toolbar entirely — WCAG 2.4.3), a Cancel carrying `aria-disabled` with neither a click guard nor
shading (announcing "unavailable" while staying lit, on a control whose `onCancel` cannot abort the
in-flight create), and three untested seams.

**Four of the five are one correct pattern applied to a control and not its neighbour.** The submit
got a click guard, Cancel did not. `IsolateControl` got a separate focus ref, the two new split
buttons did not. The LOE tool announced its pointer picks, the Link tool did not. None was a design
error; each was an inconsistency inside a diff whose own docblocks described the right thing — which
is precisely the class a reviewer reading for consistency finds and an author reading for intent
does not. This is the third epic running where that has held, and it is the argument for running the
gate rather than reserving it for epics that feel risky.

Every fix carries a regression test **verified to fail against the old code before being kept** —
the discipline that separates a regression test from a test that happens to pass.

## Consequences

- **The CPM engine is not imported.** No scheduling input is added, removed or changed, so the
  ADR-0034 recalc parity gate is untouched **by construction**. The quiescence work changes _when_
  the client asks for a recalculation, never what the server computes.
- **No API, DB or permission change.** Every write composes an existing mutation.
- Flag-off parity suites are kept and pinned. They are the rollback contract.
- `TECH_DEBT` #59 stays open — CI cannot measure ADR-0026 §16's hardware envelope, and nothing here
  claims to have.

## Alternatives considered

- **Fix the three candidate Escape causes blind.** Rejected: two of the three were not broken, and
  "fixed" without a mechanism is how the next report gets closed as a duplicate of a defect that
  never existed.
- **Float the band over the canvas.** Rejected — see §3.
- **A boolean or counted recalculation hold.** Rejected: a double release opens someone else's pick,
  and the failure is silent.
- **A live region on the band.** Rejected: the panel already announces every transition; a second
  region says the same sentence twice.
