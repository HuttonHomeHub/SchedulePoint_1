# ADR-0110 — A gate is verified against the defect it names

- **Status:** Accepted
- **Date:** 2026-08-25
- **Supersedes:** nothing
- **Amends:** ADR-0092 (the dock's row now also carries the plan's facts), ADR-0109 (the deck's one
  geometry)
- **Spec:** [`docs/specs/workspace-chrome-fit/`](../specs/workspace-chrome-fit/)

## Context

Three complaints against `web-v0.103.0`: the header sits on two rows and must fit on one; the
activities panel and the status bar look combinable; the toolbar's label heights differ and draw the
eye. One epic, four milestones, and the measurement that decided each of them.

What the epic is actually about is narrower and more useful than any of the three: **four separate
times, something that looked like evidence was not.** Twice it was my own instrument. Once it was a
feature that passed every test while being visibly broken. Once it was a gate, written that day,
blind to the exact defect it cited as its reason for existing.

## Decisions

### D1 — The plan's facts have two hosts and a mandatory fallback

The workspace foot carried two bands, and both said "Activities" — the row's own heading and the
status bar's activity count, the same subject rendered twice. The count now names the panel and
gives its size. The canvas gains ~25 px at every width where that row exists.

Where the facts render is decided by a **registry rather than a branch**: the collapsed activities
bar mounts an outlet, so the facts land in the row a planner is already reading; expanded, or below
`md`, they render in the shell's status row. Three states, one mechanism, no conditional to get
wrong.

**The fallback is not a courtesy.** Below `md` the activities bar is not mounted at all — measured,
not inferred (`activitiesBarMounted: false` at 700 and 600 px). A merge that assumed the row exists
would delete the plan's facts on exactly the screens with least room to lose them, which is
ADR-0081's defect: a capability with no host, shipped green.

ADR-0092's 0 px dock guarantee survives, re-measured with the facts present: canvas 740 px with the
dock empty, a tool armed, and an activity selected.

### D2 — One geometry on the command deck, and the measurement that chose it

A plain command stacked its label under its icon while a split-button or popover trigger kept it
beside. Nobody chose that: `Deck.tsx` applied the stacked geometry on the `ToolbarButton` branch
only, and every `render`-branch item bypassed it. One `if` with a side effect on layout.

All 27 controls are now inline. Worst within-row label spread **12 px → 3 px**; deck height
**116 → 108** at 1920/1646/1440, and **116 → 224 at 1280**, where the cards wrap from two lines to
four. The 1280 cost was put to the product owner with the number and accepted knowingly.

**`docs/TECH_DEBT.md` #185 is answered and was wrong about the size of its own prize.** It calls
un-stacking "the single biggest term in the height"; measured, it is worth **8 px**. The deck does
not reflow between 1280 and 1920 because its 2089 px of items fit in exactly two lines at every
width in that range — so the 116 px was a **wrapping** cost, not a **stacking** one.

### D3 — M3 is withdrawn on its own falsification condition

The one-row header was the product owner's firmest requirement ("this needs to fit on one line
without question"). It does not fit. At 1440 in the worst pen state the merged row is **536 px
short** against a written +120 px bar, because the pen sentence reaches 432 px where an Org Admin
views a plan someone else holds — and in eight of ten lock states that sentence is the only thing
naming who holds it.

This is the **fourth** time this merge has been costed and the **third** withdrawal. The difference
is that the condition was written before the measurement and the number is on the page. Re-scoping
it as "the pen sentence moves off the identity row" makes it fit (+130 px at 1440), but that changes
where the pen model speaks and belongs to a milestone with that as its subject.

**The complaint is therefore unfixed, and that is stated rather than implied.**

### D4 — A collapse that collapses the thing it is collapsing is not a collapse

M2 built a container-query collapse so the facts could shed their labels in a tight row. Tailwind's
`@container` sets `container-type: inline-size`, which applies `contain: inline-size`: the element
stops sizing to its content. As an auto-width `shrink-0` flex item, the facts **collapsed to 24 × 48
px** with all five present in the DOM and overflowing.

**Every gate passed.** The unit suites run in jsdom, which has no layout. `factsText` still read the
whole sentence, so any "the facts are present" assertion was green. And SC-5's 0 px dock equality
passed **because the broken facts were taking no width** — a gate satisfied by the thing it protects
being broken.

It was caught by measuring the facts' own box, and it is **withdrawn rather than repaired**: the
query asked the wrong question. Its threshold measured the facts' own width when what decides
whether they need to collapse is whether the **row** is tight, which depends on what is docked
beside them and is known at the row. Labels now always show, which holds "never an absence" more
strictly than a disclosure that hides four facts behind a press.

### D5 — A gate is verified against the defect it names, not against the code that exists

M1 restored the WCAG 2.5.8 target-size sweep that ADR-0109 D1 deleted along with the width ladder it
tested — correctly deleted, since it asserted a row that no longer exists, but it was the **only**
automated cover 2.5.8 had (`#186`). `axe` cannot replace it: `target-size` is tagged `wcag22aa` while
every scan here requests `wcag2a`/`wcag2aa`, **and** the rule ships `enabled: false`.

The replacement was written with both of ADR-0090 M5's recorded traps in mind, and **still could not
see a split button's caret** — the exact control class it exists to protect, and the one ADR-0090
records shipping at 23 × 36 under a previous gate that was also sweeping the wrong element and also
reporting green. `ToolbarSplitButton` spreads `data-toolbar-item` onto the **primary** button; the
caret is its **sibling** with no such attribute, so the descent to a focusable control never ran. The
docblock claimed "a split button contributes both halves". It was false.

So the rule, which is this ADR's title: **a gate is not finished when it passes; it is finished when
it has been made to fail by the defect it was written for.** The sweep now enumerates every pointer
target in the deck in one pass, and was verified red against a deliberately shrunk caret — naming
all three at 12 × 36 — before the caret was restored and green confirmed. Closing `#186` with a
blind sweep would have been worse than leaving it open, because a green gate stops anyone looking.

### D6 — The ADR index is gated, not remembered

ADR-0078 S1 found **seven** ADRs missing from `docs/adr/README.md` and repaired them. Writing this
one found ADR-0109 missing from it again — because `check-adr-coverage.mjs` validates coverage and
never reads the index. A rule repaired by hand and left ungated recurs at the next opportunity, which
here was the very next ADR. The gate now checks that every ADR file has an index row and every index
row an ADR file.

## Consequences

- One of the three complaints is fixed and released (`web-v0.104.0`), one is fixed here, one is
  withdrawn with its arithmetic on the page.
- `#186` is closed with a gate proven in both directions; `#185` is answered; `#187` is opened for a
  residual 3 px label spread with three falsified hypotheses recorded, so the next reader does not
  re-run experiments that have already been run.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction.
- Five specialist reviews ran over the combined diff. Four passed; the fifth returned the D5 finding.
  That is eight consecutive epics in which this pass has found something a human read did not.
