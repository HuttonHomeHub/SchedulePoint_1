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

## Gates

`pnpm lint && typecheck && test` · `scripts/e2e-local.sh web` · `web:workspace-chrome` (the dock's
own suite — its 0 px assertions are what would catch an accidental re-host) · `web:toolbar-fit` ·
`pnpm measure:toolbar vertical-stack` (row 3 changes `aboveCanvas`'s sibling, and the canvas height
is the number this epic is judged on) · `node scripts/shoot.mjs --width 1646`, then look at it.
