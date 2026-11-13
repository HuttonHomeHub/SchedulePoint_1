# ADR-0220: The first planner to open a free plan holds the pen

- **Status:** Accepted — 2026-11-12. The product owner approved the spec with all four of its defaults: take the pen on
  opening (Q1), Org Admins too (Q2), let go after 15 minutes hidden (Q3, built in a later milestone of the same
  epic), and no per-person switch (Q4).
- **Date:** 2026-11-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0028](0028-plan-edit-lock.md) (the acquire model: an explicit Start editing was a default nobody
  was asked about, `docs/features/plan-edit-lock/feature-spec.md:149-150`).
- **Spec:** [`docs/specs/first-planner-gets-the-pen/`](../specs/first-planner-gets-the-pen/feature-spec.md) §4.7 ·
  **Plan:** [`implementation-plan.md`](../specs/first-planner-gets-the-pen/implementation-plan.md) (M1 builds D1–D3
  and D6, M2 D4, M3 D5)
- **Builds on:** ADR-0048 (undo is per pen session), ADR-0081 (an entry point and a journey), ADR-0088 D1 (no flag),
  ADR-0112 (the pen sentence), ADR-0133 D5 (the pen leads the row it unlocks), ADR-0190 (what 1.0 promises).

## Context

Every plan opened read-only and a Planner pressed **Start editing**, every time. ADR-0028 chose that as a
non-critical default; the product owner, working through the runbook, called it tiresome (2026-11-11) and asked for
the opposite: when nobody else is editing, the first Planner to open a plan simply gets the pen, and the request and
take-over steps appear only when a second person opens a plan someone holds. The 423 gate, the lease and the
hand-off are unchanged; what changes is **who presses acquire, and when**.

The change is made in the browser only. `PlanLockService`, its policy and its routes are not touched (ADR-0190's
contract is the same), and nothing in the database changes.

## Decision

**D1 — Acquire on opening.** When the workspace of a plan mounts in a visible tab and a status read made since that
mount says `FREE` or `EXPIRED` and `canAcquire`, the client sends one acquire, `{ takeover: false }`. It reads only the
server's `state` and `canAcquire`, never a role (ADR-0028's client rule). It **never** sends `takeover: true`, so an Org
Admin who opens a plan a Planner holds is shown the same Take over (with its confirmation) as before. It never acquires
from a status poll: the decision is taken once, at the opening, so a pen that frees up while somebody is watching is
not grabbed from under a colleague who is about to ask for it. A plan opened in a background tab waits until it is
first shown, so five plans opened in five tabs do not take five pens. A cached status from an earlier visit is not
read: the decision waits for a fresh one.

While the acquire is in flight the pen view reads as loading ("Checking who’s editing this plan…"), decided at render
from the status rather than after it, so no frame offers an enabled Start editing and a screen reader hears one
sentence per opening. Losing the race (423 `PLAN_EDIT_LOCK_HELD`) is silent: no alert and no lost-control banner; the
refetch the mutation settles with shows who holds it and offers Request control. A failure of any other kind leaves
today's free view, where Start editing is still on offer.

**D2 — Stop is respected for the opening.** Stop editing, a hand-over, and a pen lost to a peer end automatic
acquisition until the next mount (a reload, a plan switch or a new tab: the workspace is keyed per plan). Start editing
remains the way back in, and pressing it, or Take over, makes a later loss news again.

**D3 — A loss nobody caused is not announced.** A heartbeat refused with `PLAN_EDIT_LOCK_LOST` now refetches before
it decides. If the plan is `FREE` or `EXPIRED` and `canAcquire`, the lease was released by this person's own other tab
or by a reload (the lock is per user, not per tab, and release deletes the user's row), and the client retakes it
silently, **once** per loss, until a heartbeat the server accepts proves the lease live. Otherwise (a peer holds it, or
the retake is refused) today's "Editing control was taken over" shows, and now it is true. This corrects
`docs/archive/design/plan-edit-lock-web.md:441-445`, which said the other tab's next heartbeat "re-acquires": the code
never did, so closing a second tab told the first that somebody took over. A heartbeat that was already in flight when
Stop was pressed is not answered with a retake. Undo is unchanged: the history survives a lost pen (ADR-0176 D4, which amended ADR-0048's "a 423 clears the stack"; `use-plan-edit-history.ts` `clear`), and each step is checked against the server before it writes.

**D6 — No flag, no API, schema or environment change.** ADR-0088 D1: a `VITE_` flag cannot be switched on a published
image, and the rollback is pinning `WEB_IMAGE_TAG`. `apps/api` is untouched.

**D4 — A requester takes the pen that is freed.** A tab that pressed Request control remembers the holder it asked
(the id in the response). When a later status read shows `FREE` or `EXPIRED` and `canAcquire`, in a visible tab, it
sends one acquire, `{ takeover: false }`, and pressing nothing. The memory is dropped when this tab holds the pen or a
different holder is seen, because the request was to that person and not to whoever comes next; the server deletes its
own record of the request with the lease row on release, so only the client can remember it. A colleague who wins the
race is silent, as in D1. Unlike D1 it may act on a poll, because the person asked for exactly this.

**D5 — A tab hidden for 15 minutes stops heartbeating.** While this tab holds the pen and has been hidden for 15
continuous minutes (`HIDDEN_LET_GO_MS`), its heartbeat interval skips its beat. It never sends a release: the lock is
per person, not per tab, so a visible sibling tab of the same person keeps the lease alive with its own beats. The
time is measured from the `visibilitychange` that hid the tab, never by counting ticks, because a hidden tab's timers
are throttled. Without a beat the server calls the holder inactive after 90 s, so a peer may Take over now without the
grace wait, and the lease expires at 120 s, after which the next Planner to open the plan gets it under D1. The
existing beat when the tab is shown again resumes the lease if nobody has taken it; if the lease is gone the 423 goes
through D3: a silent retake when the plan is free, the "taken over" notice when someone else holds it. The undo history
is not cleared by that return (ADR-0176 D4), though a step the server can no longer apply is set aside as ADR-0176
describes.

## Alternatives considered

- **Acquire on the first editing gesture.** Reading would never take the pen, but every pen-gated entry point (the
  canvas tools, Add, the Gantt cells, every editor, paste, undo, the accelerators, auto-recalc) would need an
  acquire-then-write path that can refuse a gesture already drawn, the seam ADR-0081 records failing five times.
  Three to four times the work with a long tail. Rejected (Q1).
- **A per-person "start editing automatically" preference.** There is no preferences table, so it is a schema change or
  device-local storage (ADR-0173). It can be added on top of this without rework. Not now (Q4).
- **A keyboard shortcut, or remembering "I am editing this plan" per session.** Removes the hunt, not the press; the
  second is this decision with a worse rule for the first opening. Rejected as an answer to the request.
- **A per-tab lease id**, which would make release and heartbeat exact per tab and remove the reload race. A schema and
  API change for a race D3 already makes harmless. The escape hatch.
- **An untouched pen hands itself over when asked.** Needs cross-tab messaging or server knowledge of the last write.
  A follow-on, worth doing only if the 45-second grace proves to bite.

## Consequences

- A Planner who opens a plan only to look holds the pen while that tab stays open, so a colleague who arrives later has
  to ask for it (Request control, then up to the 45-second grace). A tab left **hidden** lets go after 15 minutes (D5): a peer may take over 90 s after
  that and the plan is free 120 s after that. A **visible** idle tab still holds the pen with **no time limit**: the
  heartbeat every 30 seconds renews a 120-second lease whether or not anyone is at the screen, because a tab in the
  foreground is not hidden. That is a known cost of taking the pen on opening, not an oversight.
- A heartbeat refused while the plan reads free is retaken silently, once, and nothing the client can read says why the
  plan is free. An Org Admin's force-release (`force_released`, `plan-lock.service.ts` `release`) also leaves the plan
  free, so the released editor's tab would take it back within about 30 seconds and undo that admin act. The web has no
  screen that sends a force-release (the only `DELETE` it sends is the holder's own, from Stop editing and from leaving
  the page), and neither the 423 body nor the status carries a cause, so telling the two apart needs an API change.
  This is a known cost, recorded as `docs/TECH_DEBT.md` #587 with its trigger.
- `PlanPen` gains `autoAcquiring`, and `usePlanPen` sends a `POST …/edit-lock` on its own: one extra
  `plan_edit_lock.acquired` log line per Planner opening of a free plan.
- Viewers, Contributors and share-link guests never take it: the first two read `canAcquire: false`, and the share page
  does not mount the pen.
- The browser journeys press Start editing far less. A journey that means "nobody holds it" must say so with
  `expectPenFree`, and reaching that state by a reload now needs a Stop first (`apps/web/e2e-support/pen.ts`).
- ADR-0028's header gains "amended by ADR-0220", and CLAUDE.md §16 gains one line.
