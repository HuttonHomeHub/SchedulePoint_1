# ADR-0113 — Measure the problem, not just the remedy

- **Status:** Accepted
- **Date:** 2026-08-26
- **Supersedes:** nothing
- **Amends:** ADR-0112 D4 (the merged row becomes three sections), ADR-0064 (the mode statement's
  copy), ADR-0092 (the canvas dock's width is now a costed constraint rather than spare room)
- **Spec:** [`docs/specs/canvas-maximisation/`](../specs/canvas-maximisation/)

## Context

The product owner used `web-v0.107.0` and asked for the canvas to be maximised. Four ideas came with
the ask: default the activities panel collapsed, re-section the header, fold the command deck onto
one line by moving its Author group to the canvas foot, and trim the armed-tool "helper tips".

They were ranked by estimated value — the panel first at ~205 px, the deck second at 58 px, the
header third at nothing — and that ranking was **wrong at the top and the bottom**, in ways only
measurement found. Two of the four items turned out not to exist as work at all.

**This register's own rule is `verify the claim; do not trust the document` (ADR-0058), extended by
§19 to _re-verify a spec's PROBLEM statement, not only its design_.** Every instance recorded so far
is a document describing the code wrongly. This one is different and worth its own number: **the
problem statement came from a person looking at their own screen, and it was still stale — because
the state they were looking at was one they had put the product into.**

## Decisions

### D1 — The header is three sections, with the space split between them

The complaint was that the merged row looked **crammed**: brand, breadcrumb, mode and pen all packed
against the leading edge, then a void, then the organisation and the account. That is exactly what
two clusters pinned to two edges looks like, and it is what ADR-0112 D4 shipped.

It is now three sections — brand + the plan's identity, the plan's modes + pen, organisation +
account — on `justify-between`, so the free width is split **between** them rather than banked in one
gap. Measured: the sections need **582 / 620 / 256 px**, so the two gaps are **202 px each at 1920**
and **65 px at 1646**, and nothing truncates until the container falls below 1458 px.

The header gains a second plan slot (`mode`). One slot cannot put its contents in two sections, and
`chrome-slot.tsx` already argues that another name costs a string where a parallel provider costs two
of everything.

### D2 — Space-between, not a truly centred middle, and the reason is 110 px of plan name

The product owner asked for the middle section to be centred. **Centring means the outer sections get
equal shares — that is what centring is** — so section 1 is capped at whatever section 3's share is:

| viewport | container | share each | section 1 needs | result                     |
| -------- | --------- | ---------- | --------------- | -------------------------- |
| 1920     | 1862      | 609        | 582             | fits, 27 px spare          |
| 1646     | 1588      | 472        | 582             | **110 px of the name cut** |

It had been put to them as "~10 px over at 1646" — an estimate. Measured, it is **110**, on the
machine this product is used on. Re-put with the real figure, the decision was space-between: the
middle sits 163 px right of true centre at 1920, which is a look, against a truncated plan name,
which is information.

**The accepted consequence is written down rather than left to be found.** On a **wrapped** line,
`justify-between` places a lone item at flex-start — so below 1440, where section 3 is alone on line
2, the organisation and account sit at its left, measured 1126 px from the trailing edge. **No CSS
has both**: `ml-auto` on section 3 right-aligns the wrapped line and, on a full line, absorbs the
free space _before_ `justify-content` sees any, collapsing the two gaps and restoring exactly the
crammed look this decision exists to fix. Those widths are below the stated fallback, so the journey
pins the one-line states and names the wrapped behaviour in its own docblock.

### D3 — A tool statement names a mode, offers an exit, and explains nothing else

The armed-tool statements were reported as adding little. They cost **no canvas height** — ADR-0092
docks them into a row the workspace pays for either way — so this is a copy decision, not a layout
one, and each sentence splits into three parts:

- The **mode** stays. ADR-0064 was opened on a planner who could not tell which tool was armed, six
  link attempts producing zero dependencies. The leading words are why this band exists.
- The **exit** stays. ADR-0064 records Escape's behaviour being specified wrongly and found only by
  testing; `Esc to stop` is the only place the product says it.
- The **explanation** goes. Em-dash-and-full-stop prose becomes middot-separated clauses, which reads
  as a status line rather than a paragraph.

**Two clauses were kept against the brief, and that is the decision worth recording.** `or click for
a day` and `Ctrl to add` are **not** explanations: the comments beside them record each as an
undocumented shortcut nobody could discover from the copy, added deliberately for that reason.
Cutting them re-hides a capability rather than trimming a sentence. They are compressed instead — 66
characters against 88, and 58 against 99.

### D4 — Two of the four asks are withdrawn on measurement, and the numbers are kept

**The activities panel already defaults collapsed.** `useState(true)`, session-local, with only its
height persisted — it is collapsed on every load. There was never a default to change. Expanding it
costs a measured **265 px** at both widths, constant, which is a planner's choice rather than a
product defect.

**The one-line deck is withdrawn, not deferred.** It required the Author group to leave the command
band, and Author has nowhere to go: the Activities handle row is ADR-0092's canvas dock, whose region
is **924 px at 1920 and 650 px at 1646**, and Author needs **608** — leaving 42 px at the width this
product is judged on, which is less than the shortest transient strip in the set. With Author there,
arming a tool or selecting an activity grows the row to two lines, because it is `min-h-9` rather
than `h-9`. All four cards on one line need 2618 px against an 1862 px container.

## What was wrong, and how each was found

**The panel estimate came from a screenshot the product owner had changed.** It was ranked first at
~205 px from an image in which they had expanded the panel — and **two of the three screenshots they
sent show it collapsed.** The evidence was already in hand and one of three was read. This is §19's
re-verify-the-problem rule, failed in the session that shipped the ADR quoting it.

**A register entry was cited from memory and mapped onto the wrong component.** The one-line deck was
proposed as "finish ADR-0090 M2-T6's unshipped caption-gutter deletion". That item was about **row**
captions in the two-row `Toolbar` which ADR-0109 D1 deleted; the deck's captions are each a focusable
disclosure button that folds its group and holds a roving tab stop, and `Deck.tsx` records turning
the card on its side specifically to spend their width instead of their height. Deleting them removes
a feature. **It was told to the product owner as owed work**, which it is not — ADR-0076 Class 2, in a
recommendation rather than a document.

**And ADR-0112's own headline percentage described a state the product never starts in.** The
vertical harness expands the activities panel to measure, so its canvas figures are the expanded
canvas. The 45 px delta was measured correctly before and after; the denominator was wrong. In the
default state the same gain is **+6.0 %**, not +9.3 %, and both are now given with the state named.

**The instruments were wrong twice more.** The first probe of the handle row reported `null` because
it searched for "New activity", which belongs to the **expanded** panel's header — and that row
carries a `data-activities-bar` hook precisely because locating it by its copy had bitten three
times. It bit a fourth. The second probe reported "free width" as 0 in every state, because the dock
region is `flex-1` and always fills: the right question was what the dock has to _give_, not what is
left over.

## Consequences

- The canvas is **776 px of a 1080 px screen at 1920 — 72 %** — with 209 px of chrome above and a
  25 px status bar below. There is no hidden space; four epics of shaving the band have left it
  efficient, and the remaining levers are small.
- **`justify-between` on a wrapping row is now a documented pattern with a known edge**, pinned by
  a browser assertion rather than a paragraph.
- ADR-0092's dock row is no longer "spare width the workspace pays for either way" — it is a
  **costed constraint**, 650 px at 1646, and anything proposed for it must be measured against that.
- `docs/TECH_DEBT.md` **#199** (the screenshot harness cannot finish its own run), **#200** (two
  named-slot registries, the better pattern not the one the chrome slots use) and **#201** (two
  unrelated binary switches rendered as one four-way group) stay filed and unbuilt.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate is
untouched by construction.
