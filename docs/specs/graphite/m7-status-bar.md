# Graphite M7 — the status bar, and a premise that had gone stale

**Status:** planned · **ADR:**
[ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) D5 · **Follows**
[`m6-activity-context.md`](m6-activity-context.md)

## First: the plan's dock re-host is NOT needed, and that is a measurement

`plan.md` §A6 says:

> `ActivityPanelCollapsedBar` **is** the `CanvasDockOutlet`'s host. If the table becomes a drawer
> panel, the dock falls back to rendering in place and every transient strip goes back above the
> scene — reversing an epic that shipped six days ago at a measured 0 px cost. **The status bar
> becomes the dock's new host.**

Read the conditional: the re-host is required **if the table becomes a drawer panel**. It did not.
M6 put the _activity editor_ in the drawer, which is what `design.md` §2 lists the drawer as
carrying; the activities table is still in the bottom panel and still hosts the dock —

```
activity-bottom-panel.tsx:75    {hostsDock ? <CanvasDockOutlet /> : null}
activity-bottom-panel.tsx:106   <ActivitiesTable …
```

So **ADR-0092 is preserved by doing nothing**, which is the safest outcome available, and moving the
dock would be work whose own justification does not apply. Recorded here rather than done, because
working through a plan's task list is evidence the tasks were written — not that they are still the
right tasks (ADR-0081, and CLAUDE.md §19's "re-verify a spec's PROBLEM statement, not only its
design").

## What M7 is, once that is removed

A status bar in grid row 3, carrying **facts** — `design.md` §3's word, and the discriminator that
decides everything else on this surface:

| Carries             | Why it is a fact rather than a command                               |
| ------------------- | -------------------------------------------------------------------- |
| Activity count      | A property of the plan                                               |
| Data date           | ADR-0033's mandatory project instant                                 |
| Project finish      | The schedule's answer; moves here from the identity line             |
| Critical count      | A count, not a filter — `Next conflict` stays a command on the strip |
| Recalculation state | **The load-bearing one** — see below                                 |

Row 3 is `auto`, so an unfilled status bar is a zero-height row and the twelve screens that are not
a plan keep the frame they have. That is the same content-driven-height property M2 built the grid
for.

## `Recalculate` stops being a button pretending to be a status

ADR-0099 D5's phrase, and it is precise. ADR-0032's coalesced auto-recalc already runs on every
edit, so the command is a _fallback_; what a planner actually needs from it most of the time is the
answer to "is the schedule current?", which is a fact.

**And this changes a decision M5 made ten hours ago.** `recalculate` was ranked `priority: 95` on
two grounds, the second being that "its spinning icon is the only visible cue in the product that a
recalculation is running at all". Its own docblock says: _"ADR-0099 M7 re-homes the running state to
the status bar. When it does, re-read this: the second ground goes with it, and 95 may then be more
than the command needs."_ This milestone is that re-read.

## A14 — the status bar will race its own announcements

`announcer.tsx` is a **single shared app-wide polite region** that clears-then-sets on an animation
frame. Wiring five facts to it means one recalculation — which changes finish, critical count and
save state together — drops at least one message silently.

The rule, from the plan and kept: **only transitions that need proactive notice announce; facts a
reader can look at do not; and where several must change together they compose into ONE sentence
through ONE `announce()`.**

## Sequence

| Task                                                      | Ends with                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **T1** The bar in row 3, with the facts                   | An unfilled bar is a zero-height row — asserted, not assumed                                     |
| **T2** The finish read-out moves off the identity line    | One home for it; the identity line loses a claimant                                              |
| **T3** Recalculation as a state, and the priority re-read | The three states — not calculated / calculating / calculated — do not collapse into one sentence |
| **T4** Announcements per A14                              | One `announce()` per transition, verified by count                                               |

## What it cost, measured

`pnpm measure:toolbar vertical-stack`, at the product owner's 1646:

|               | before M7 | after M7 |
| ------------- | --------: | -------: |
| `aboveCanvas` |       135 |  **135** |
| canvas height |       681 |  **656** |

`aboveCanvas` is unchanged, which is the point of putting the bar in row 3 rather than in another
band above the scene. The canvas gives back **25 px** — the designed 24 plus its 1 px rule — and
that is a real cost in an epic whose thesis is canvas height, so it is stated rather than buried.
Across Graphite the net is still **576 → 656 at 1646, +14 %**, with the bar paid for out of the
105 px M2–M5 recovered.

## T3's re-read, performed

M5 ranked `recalculate` at `priority: 95` on **two** grounds and left an instruction in its docblock
to re-read them here. Done: the second — "its spinning icon is the only visible cue that a
recalculation is running" — is gone, because that cue is now on this bar. The first stands alone and
is enough: a command that makes the schedule correct after an edit is not one to bury, and dropping
the rank returns it to the `⋯` at every width, which is exactly where `e2e-edit` and `e2e-toolbar`
both timed out on it during M5. The rank is unchanged; the **justification** is corrected, because
one that has lost half its support and still reads as two grounds is the drift this register exists
to catch.

## A finding in the test harness, not the product

`TestChromeHost` offered the `rows` slot alone. A `ChromePortal` with no target renders `null`, so
every suite using it has been asserting a screen with pieces missing — the plan's four **mode
segments** among them, portalled into `rail` since M5, in the very file whose assertion reads _"one
command strip and the rail's mode cluster"_. The status bar surfaced it because it is the first
portal those suites actually look for.

It now offers all four, and the rule is stated where the next name will be added: **every
`ChromeSlotName` has a target in this host**.

The same run found the two mocks of `useScheduleSummary` in `plan-workspace-toolbar.test.tsx`
disagreeing — the barrel path answering `undefined` while the api path answered a real date, so one
query returned two answers depending on which import reached it. Harmless while its only consumer
was an announcement nothing asserted; visible the moment a second consumer read it.

## The base journey had been red since M5, and nothing was running it

`e2e/schedule.spec.ts:142` clicked a top-level button named `Settings…`. That is the `calendar`
command, which carries `priority: -100`, so M5's merge put it in the `⋯` at every width and this
line has been timing out ever since.

**It is the same defect `e2e-library` had, and it survived that fix** because that one was found by
grepping for `data-toolbar-item="calendar"` while this site names the **copy**. Located by registry
id now, through the shared `revealToolbarCommand`.

The reason nobody saw it is the more useful half: **`scripts/e2e-sweep.sh` did not include the base
journey.** Thirty-three suites ran green over it, twice. ADR-0096 added `web` as a target to
`e2e-local.sh` for precisely this reason — "change a screen, run the base journey" — and stopped one
line short of the sweep. It leads the list now.

## Gates

`pnpm lint && typecheck && test` · `scripts/e2e-local.sh web` · `web:workspace-chrome` (the dock's
own suite — its 0 px assertions are what would catch an accidental re-host) · `web:toolbar-fit` ·
`pnpm measure:toolbar vertical-stack` (row 3 changes `aboveCanvas`'s sibling, and the canvas height
is the number this epic is judged on) · `node scripts/shoot.mjs --width 1646`, then look at it.
