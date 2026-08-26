# ADR-0112 — A header row wraps, and a pen sentence is a fact

- **Status:** Accepted
- **Date:** 2026-08-26
- **Supersedes:** nothing
- **Amends:** ADR-0110 D3 (which withdrew this merge on a figure its own instrument inflated),
  ADR-0092 M5 (which withdrew it earlier for want of width), ADR-0093 (whose discriminator now
  applies to a model as well as to a command), ADR-0097 D1b (whose `identity` chrome slot returns)
- **Spec:** [`docs/specs/one-row-header/`](../specs/one-row-header/)

## Context

The product owner's firmest complaint against `web-v0.103.0` — _"the header being split over two
rows … needs to fit on one line without question"_ — was the only one of three still unfixed. It had
been costed four times and withdrawn three (ADR-0091 D4, ADR-0092 M5, ADR-0110 D3), always on a
number, and the numbers were the point: this register records **five consecutive epics whose width
expectation was contradicted by their own measurement, all in the same direction.**

So the epic's first act was not to design but to **repair the instrument**, and its second was to
write the falsification condition down before running it.

That mattered more than expected. `inkOf` was found to sum **leaf rectangles**, which never counts a
button's own padding, and the composed row it fed understated the merged header by **266 px** — more
than twice the whole +120 px bar the decision turned on. Measured honestly by a shrink-to-fit probe
that composes the real occupant nodes and reads what the row requires, the merge needed **1482 px**
against containers of 1222 / 1382 / 1588 / 1862: slack of **−260 / −100 / +106 / +380**. Only 1920
cleared the bar. **1646 — the width this product is judged at — missed it by 14 px.**

That instrument is credible because it was pointed at something already known: today's identity row
needs **1218 px and is given 1222**. Four pixels, which is exactly what shipped, truncating any plan
name longer than the fixture's.

## Decisions

### D1 — The pen's sentence is a fact and moves to the plan's facts row

`CompactPenStatus` rendered a badge, a live-region sentence and every ADR-0028 hand-off control as
one block on the plan's identity line. The sentence moves to where the plan's facts are read; the
badge and the controls stay beside the plan.

That is **ADR-0093's discriminator applied to a model rather than to a command** — an action whose
subject is the object belongs on the object, and a fact belongs where facts are read. It is worth
155 px on a row measured to have four pixels of headroom, and it is independently valuable: it
closes a truncation that was live before any merge.

`usePenLockView` is called **once**, and the sentence is portalled. The three things that had to be
right each carry a test verified red first:

- **`containerRef` stays on the controls.** It does two jobs — WCAG 2.4.3 focus-return after a
  user's own action unmounts the button they pressed, and `scrollIntoView` when the pen is lost.
  Attached to the moved sentence, both fire against the status bar: focus thrown to the other end of
  the screen after every Start/Stop, and **a test asserting only "focus is not on `<body>`" passes
  against that.** The case that pins it registers a real outlet, because in the in-place fallback the
  sentence is nested _inside_ the controls container and "focus is inside the controls" is true
  either way.
- **Focus return still says what happened.** The controls container is `aria-describedby` the
  sentence region, which survives the portal because a description resolves by id anywhere in the
  document.
- **The announcement needs nothing added to be complete.** Every one of the ten sentences in
  `lock-copy.ts` is self-contained, so the badge is a one-word _summary_, not extra information.

**The cost of this decision is stated rather than glossed, because a standard tensions against it.**
`docs/UX_STANDARDS.md` says _"a control that answers a condition belongs beside the condition it
answers"_ — and `ScheduleStateRegion`, two hundred lines away in the same file, follows it to the
letter by keeping "3 edits not calculated" and the `Recalculate` button in one span. The pen split
does the opposite for the **six of ten** states that pair a sentence with an action: `canTakeOver`
invites a button at the top of the screen from the bottom, `incomingRequest` likewise, and `lost` —
the most disruptive message in the set — sits at the bottom while its only remedy, `Dismiss`, sits at
the top. The ux review found this and blocked on it.

What survives the split beside the buttons is the **badge**, so the header still names the _state_;
what moved is _who holds the pen_. Put to the product owner with that framing and with the width
consequence — reverting it needs ~1749 px in the worst lock state against a 1588 px container at
1646, so the two-row header returns and D4 goes with it — the decision was to **ship and revisit from
use rather than from review**. Three alternatives were costed and declined: putting the holder's name
on the badge (~40 px of the 106 px slack, and no help at all for `lost`, which has no name to show);
moving the controls down as well (buries `Start editing`, the surface's most-used control, and
contradicts ADR-0093); and reverting outright.

This is recorded as an **open question with a named trigger** — a report about the taken-over or
take-over states — not as a resolved trade-off.

### D2 — The status bar announces nothing, and hosting a live region is not announcing

`plan-facts.tsx` carries a deliberate rule: the facts row announces nothing, because `announcer.tsx`
is a single shared app-wide polite region that clears-then-sets on an animation frame, so wiring
several facts to it drops messages silently. Putting a `role="status"` region **into** that row looks
like a contradiction and is not — the pen's region is its own element and has announced its own
transitions since ADR-0028. **Two independent live regions do not race; one shared one does.**

That distinction is now a gate rather than a paragraph (`announcement-sources.structural.test.ts`),
because the obvious "improvement" — wiring a fact to the shared announcer now that the row
demonstrably contains a live region — reintroduces exactly the defect the rule exists to prevent.

### D3 — The outlet lives inside the facts, not beside them

The implementation plan's stated risk for D1 was that the status row _"gains height where it had
none, eating the epic's saving"_: grid row 3 is `empty:hidden`, and on a wide layout the facts are
adopted by the activities handle row, leaving it genuinely empty. An always-mounted pen outlet
**beside** `PlanFactsHost` would keep it non-empty and buy ~24 px of chrome to save 155 px of width —
the wrong direction for an epic whose subject is height.

So the outlet went **inside `PlanFacts`**, and the sentence follows the facts to whichever host has
them. Measured at four widths, before and after: **not one band changed height.** The risk did not
materialise _because of where the outlet went_, which is why it was measured rather than reasoned
about.

### D4 — The header row wraps; there is no breakpoint

The product owner chose "merge at 1600 and above; two rows at 1440 and below", with the corrected
numbers in front of them and knowing the 14 px miss at 1646 — acceptable because **this row degrades
by truncating the plan name**, which carries a `title`, rather than by pushing controls out of an
`overflow-hidden` box where a pointer cannot reach them. That second thing is the ADR-0090 §2.5.8
defect and is a different failure entirely.

Before writing 1600 into the code, the probe was asked a different question: **if the row simply
wraps, where does it break on its own?** Measured, below a container of **1480 px** — one line at
1646 and 1920, two at 1440 and 1280. That is the approved behaviour exactly, with no constant to
maintain. The browser and the product owner agree, and only one of them needs keeping in step. It
also disposes of Tailwind's nearest breakpoint (`2xl`, 1536) leaving the container four pixels short.

This is ADR-0109 D1's principle — _a surface wraps; it never hides_ — applied one surface up.

**Two flex facts had to be got right, because the obvious classes give the wrong answer.** `flex-1`
on the identity slot defeats wrapping entirely: an item that absorbs the line's slack means nothing
ever moves to a second line, so the plan name truncates towards nothing while the row stays one line
tall. It is `shrink` with `min-width: 0`, which gives wrap-then-truncate in the right order, since
flex starts a new line when the next item does not fit and shrinks only within a line that still
overflows.

**The hazard that replaced the one three prior costings named.** ADR-0091 D1's objection was that
every arrangement making the header fit put `Early | Visual | Diagram | Gantt` behind a `⋯`. That is
now **void**: ADR-0109 D1 deleted the width ladder and the overflow menu, and `Toolbar` wraps
instead. The real hazard is that a squeezed mode cluster folds onto a second line **inside** the row,
turning one clean row into two ragged ones. It is `shrink-0`, and the journey asserts the cluster's
height is one control tall at both shapes.

### D5 — `identity` returns as a chrome slot name, not a second API

ADR-0097 D1b created that name; Graphite M3 deleted it, correctly, because the identity and the
modes ended up in one component and there was nothing left to carry across the shell boundary. It
returns for the original reason, now that the row it feeds wraps. A name rather than a parallel
provider, on `chrome-slot.tsx`'s own argument that a third slot costs a string.

The workspace-level registry took the same treatment: `plan-facts-host.tsx` became a re-export of a
named `plan-slot-host` serving `facts` and `pen`, rather than a third copy of one mechanism. Every
consumer and suite of the old module is untouched, which is the evidence the generalisation changed
nothing (the ADR-0078 barrel-preserving argument).

### D6 — No feature flag

ADR-0088 D1 established that a `VITE_` constant is inlined at build time and has never been an
operator rollback. The rollback is a commit boundary, and the enforcement is a journey that drives
the real product (ADR-0081).

## What was wrong, and how each was found

**Three of this epic's own claims were false, and none was caught by reading.**

1. **"The single line the one-row header turns on."** A comment in `plan-workspace-toolbar.tsx` said
   that of the identity block's `flex-1`. The journey's headline assertion was run against a build
   with `flex-1` restored **there** and **passed** — so it is not that line. The header row's
   children are the brand, the identity _slot_ and the trailing group; what the block does inside the
   slot cannot make the row wrap or stop it. Putting `flex-1` on the **slot** fails the assertion at
   1440, which is how the load-bearing line was actually identified. The claim was written before it
   was checked (ADR-0076 Class 3) and survived a build, a measurement and a green journey. It was
   caught only because ADR-0110 D5's rule was followed: **a gate is not finished when it passes; it
   is finished when it has been made to fail by the defect it was written for.**
2. **A gate that did not exist.** `test-chrome-host.tsx`'s docblock has claimed since Graphite M7
   that _"`chrome-slot.test.tsx` pins that, so adding a fifth name fails here rather than silently"_,
   and nothing in the repository referenced `ChromeSlotName` from a test at all. Adding `identity`
   produced exactly the silent gap that paragraph promises to prevent, and the failure surfaced two
   files away in suites suddenly rendering a screen with a piece missing. The gate now exists and is
   verified red both ways.
3. **An `sr-only` badge copy that announced twice.** Added out of caution so `aria-atomic` would not
   drop the state word. It was unnecessary — the sentences are self-contained — and on focus return
   the container announces its own contents _and_ its description, so the word was read twice.
   `e2e-edit/pen-smoke.spec.ts` found it by going red on `getByText('Available')` resolving to two
   elements: a journey written for something else catching a duplication no unit test had reason to
   look for.

**Two more instrument defects, in the file that had already produced two.** The probe's per-occupant
labels outlived the DOM they named — the header's children were `brand`/`orgSwitcher`/`account` for
a grid that no longer exists, so after the merge it reported the identity slot as `orgSwitcher: 1063`
— and its composed hypothetical row became a **double count** the moment a real merged row existed,
because the identity block, mode cluster and pen cluster are all _inside_ `headerCells[1]`. It still
returned a plausible 1482, four pixels from the truth by luck. Both fixed before any number here was
quoted.

**A fourth stale claim, from the component review.** `app-header.test.tsx`'s docblock, its `describe`
name and one test title all still described the `1fr auto 1fr` grid — in a diff that rewrote the
component's own docblock to say the grid was gone and edited every line inside that block to add a
prop. A comment above working code describing what used to be true, committed by the change that
removed the thing.

**The type scale did not travel with the sentence, and only a photograph said so.** `CompactPenStatus`
set `text-sm` on a `base` string shared by both halves — right for the controls container beside a
`text-sm` button, and it went through the portal into `PlanFacts`, a `text-xs` row, so "You're editing
this plan." rendered visibly larger than "Activities 10" beside it. A component styled for its old
home whose type scale nobody re-derived for its new one. The sentence now inherits, which is what
makes both homes right and keeps the in-place fallback byte-identical.

**The accessibility review passed with nothing blocking**, having worked the flex-wrap arithmetic by
hand rather than assuming a wrapping row is safe: no `order-*` anywhere, so DOM order and line
placement stay coupled; exactly one `banner`; `min-h-14` grows rather than clips. It contributed two
things. `containerRef`'s second job is now a **no-op** — the shell is `grid h-dvh … overflow-hidden`
with `<main>` as the only scroller, and this container sits in the always-visible header, so there is
nothing for `scrollIntoView` to scroll; the docblock claimed "two jobs" and now says which one is
real. And it recommended extending the journey to **1280**, because this epic's own falsification
record warns that a 37 px placeholder plan name once hid a real overflow and 1280's arithmetic is the
tightest of the three. Done, with the long name and a real project crumb.

**And the sweep that is supposed to catch what a search misses was itself scoped by memory.**
`scripts/e2e-sweep.sh` named `toolbar-fit`, deleted with ADR-0109 D1 and resolving to nothing, and
**omitted seven suites that exist** — including `workspace-fit`, the one measuring WCAG 2.5.8 target
size, i.e. the one a layout change is most likely to break. Its list is now derived from
`apps/web/package.json`.

## Consequences

- The canvas gains **45 px at 1646 (+9.3 %)** and 45 px at 1920; 1440 and 1280 gain 9 px each. No
  width regresses. The 45 px comes out of the **command band**, not the header — ADR-0092 M4's
  _"relocating a row inside one column removes nothing"_ did not happen here, which is exactly why it
  was measured rather than assumed.
- **A wrapping row's height is a function of its width.** That is the accepted cost, and it is why
  the band is `min-h-14` rather than `h-14`: a fixed height would clip the second line instead of
  showing it, which is the ADR-0090 defect one more time.
- **The organisation switcher is no longer centred** on the twelve `_authed` routes that are not a
  plan; it sits at the trailing edge beside the account chip. Judged from photographs rather than
  from a description, and accepted: brand-left / account-right is the conventional shape, and a lone
  centred switcher read as a floating island. Nothing below it moves.
- **Two named-slot registries now exist** with nearly the same shape — `chrome-slot.tsx`
  (shell-lifetime, parent-assembled, refs threaded as props) and `plan-slot-host.tsx`
  (plan-lifetime, self-registering). They cannot share one _provider instance_, because
  shell-scoped registrations must survive route changes and plan-scoped ones must not; they could
  share an _implementation_, which would delete the ref threading and its eleven test call sites.
  Filed rather than built here (`docs/TECH_DEBT.md` #200).
- `docs/TECH_DEBT.md` **#201** records a **pre-existing** defect this epic surfaced without causing:
  `Early | Visual` and `Diagram | Gantt` are two unrelated binary switches rendered as one four-way
  group under one accessible name, with `demotionGroup` distinguishing them and having no visual or
  ARIA expression at all since ADR-0109 D1 deleted the ladder that consumed it. Not fixed here —
  giving `demotionGroup` a rendering meaning is a `Toolbar` contract change, which is ADR-0105's
  trigger.
- `docs/TECH_DEBT.md` **#199** records that `shoot.mjs` cannot finish its own run — pre-existing,
  verified against the stashed tree, and it costs the three canvas-lens shots that no contrast matrix
  or axe scan can stand in for.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction.
