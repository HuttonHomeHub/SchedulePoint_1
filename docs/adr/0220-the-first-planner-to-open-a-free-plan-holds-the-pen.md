# ADR-0220: The first planner to open a free plan holds the pen

- **Status:** Accepted — 2026-11-12. The product owner approved the spec with all four of its defaults: take the pen on
  opening (Q1), Org Admins too (Q2), let go after 15 minutes hidden (Q3, built in a later milestone of the same
  epic), and no per-person switch (Q4).
- **Date:** 2026-11-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0028](0028-plan-edit-lock.md) (the acquire model: an explicit Start editing was a default nobody
  was asked about, `docs/features/plan-edit-lock/feature-spec.md:149-150`). **D7 added 2026-11-13 for `docs/TECH_DEBT.md`
  #588**: a request can be withdrawn, and the tab's memory of one follows the server. **D8 added 2026-11-13 for the
  idle tab**: a visible tab nobody touches for 30 minutes lets go too.
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

The cost, plainly: a requester could not withdraw a request, so someone who asked and then wandered off started
editing when they next looked at the tab. The waiting sentence says so ("Requested — you will start editing when
{Name} hands over or leaves.") and the live region goes straight from it to "You’re editing this plan." without a
"Checking…" between. **D7 pays this cost** (Cancel request, `docs/TECH_DEBT.md` #588), and also replaces the
memory rule above: the tab no longer remembers only its own press.

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

**D7 — A request can be withdrawn, and the tab's memory follows the server's record (#588).** Approved 2026-11-13
with Q1 answered yes. Spec: [`docs/specs/cancel-request-control/`](../specs/cancel-request-control/feature-spec.md).

- **The route.** `DELETE …/plans/:planId/edit-lock/request` clears the caller's own request and returns the status
  with 200, never 204: the answer may be "you now hold the pen" (a Hand over arrived first) or "someone else's request
  stands", and the tab must not guess. It is idempotent, needs `plan:request_control`, and the write is conditional on
  the caller's id under the same advisory lock as `request` and `handoff`, so it can never clear another person's request.
- **The button.** **Cancel request** (ghost) sits beside the disabled **Take over now** while waiting, and beside the
  live **Take over now** after the countdown, and only when the server says the pending request is the reader's own.
  An Org Admin is offered Take over, never Request control, so never Cancel. The sentence after the countdown reads
  "You can take over from {Name} now, or start editing when they hand over or leave."
- **The memory rule replaces D4's.** While another person holds the pen, a status read naming this user as the
  requester **adopts** the request (so a reload no longer leaves the sentence untrue), and a read naming nobody or someone
  else **drops** it (so a withdrawal in another tab, or a request replaced by a colleague's, is no longer acted on).
  It is still dropped when this tab holds the pen or sees a different holder, and still held through the moment of
  release, which only the tab can remember. Pressing Cancel forgets it at once and adoption is suspended while the
  DELETE is in flight, so a read that left before it cannot re-arm it.
- **If a Hand over beats the cancel**, the person keeps the pen and sees "You’re editing this plan." with Stop editing.
  Nothing hands it back: undoing a colleague's deliberate act without anyone pressing anything is worse than one press.
- **The holder is not told** the request was withdrawn. Their prompt goes on their next status read (up to 15 s), and a
  Hand over pressed late gets a 409 and a refetch. Their "Keep editing" dismissal resets once the status carries no request,
  so a fresh ask after a cancel is shown.
- **Focus.** When a colleague's act removes the Cancel request button while focus is on it, focus goes to the pen
  cluster's container, detected by containment as ADR-0135 D2/D3 do for the toolbars, in addition to the existing return
  after the person's own press.
- **A failed cancel says so** (_changed in review, 2026-11-13_; the first draft showed nothing, as Request control and
  Hand over do). The server still holds the request, so the tab re-adopts it and keeps the button, and the pen status
  replaces its sentence with one visible, announced sentence, "Couldn’t cancel your request. Try again.", until the next successful action
  (ADR-0217); it replaces rather than follows the waiting sentence because both together wrapped the foot row at
  1024 × 600 and pushed the buttons off screen. The cancel also cancels any status read already in flight, so a read that left before the DELETE cannot
  put the request back in the cache.
- **Residual, accepted.** A second tab of the same person left in the background does not learn of a cancel made in the
  first until it reads again. If the holder leaves and that tab is brought forward before it reads, it can take the
  pen. Closing it needs cross-tab messaging, which is not worth building until someone reports it.
- **Versions.** api minor (an additive route), web minor. No flag (D6 stands), no schema change.

**D8 — A visible tab nobody touches for 30 minutes stops heartbeating, and wakes on the next input.** Approved
2026-11-13 as written, including R4. Spec: [`docs/specs/idle-tab-lets-go/`](../specs/idle-tab-lets-go/feature-spec.md).
D5's mechanism applied to a second trigger, with nothing announced.

- **What counts as input.** `pointerdown`, `pointermove`, `keydown`, `wheel` and `focus` (a capture listener on `window` hears every element's focus too), heard once on
  `window` in the capture phase (so a canvas or dialog that stops propagation cannot hide it) and passive. Each only
  writes the time into a ref: no state, no render. `scroll` is not counted (the app scrolls itself). The clock starts when
  the plan opens and restarts whenever the tab is shown.
- **The threshold.** `IDLE_LET_GO_MS`, 30 minutes, measured from the last input by the clock, never by counting ticks. The
  first 30 s tick at or past it skips the beat, so the plan is free at most about 32 minutes after the last touch (the
  server calls the holder inactive 90 s after the last beat and expires the lease at 120 s). Like D5 it never sends a
  release: a second tab of the same person keeps the lease with its own beats.
- **Unsaved typed work keeps the pen.** While this tab's unsaved-work registry holds any report, the idle rule does not
  apply. The alternative, letting the existing "no longer hold the edit lock" report stand, loses the work if a colleague
  took the plan, which is the case this decision makes more likely. D5 is unchanged: a hidden tab lets go whatever is
  unsaved, because nobody can be typing into it.
- **A resting tab stops checking the status.** From its first skipped beat for idleness the tab is _resting_ and its 15 s
  status poll pauses, as it already does in a hidden tab. Without that, once the lease expired a poll would read EXPIRED,
  the tab would stop counting itself as holding, the pen sentence would become the person's own name "was editing
  (inactive)" and be announced, and the heartbeat hook, which only runs while holding, would no longer be listening for
  the input that resumes it. TanStack Query reads a `refetchInterval` function again when the query updates, not on every
  tick, so the poll stops after the read already in flight and restarts with the fetch the wake asks for.
- **Waking.** The first input in a resting tab ends resting, beats at once and asks for a fresh status. The beat either
  renews the lease (a sibling tab kept it alive, or it is within the 120 s) or meets the 423 that D3 already answers: a
  silent retake when the plan is free, the lost-control sentence when a colleague holds it.
- **No flash on waking (R7), and the hidden-tab return too** (_changed in review, 2026-11-13_). From waking until the beat
  has settled **and** the retake's read has finished, the view keeps the last held lease whatever the status says. The first
  draft masked only FREE and EXPIRED, and in a browser a colleague's take showed three sentences about 70 ms apart ("{Name} is
  editing…", "You're editing…", then the lost sentence); now it goes straight from held to the lost sentence, or stays held.
  The same guard covers a hidden tab coming back, where the refetch on return could land before the beat's 423.
- **A write sent with the wake (E4)** (_changed in review, 2026-11-13_; the first draft dropped the change without a
  word). A write refused while waking, **or while the beat's retake is in the air**, goes through D3's look-first path; one
  refused after the retake finished, before any beat has been accepted, is checked against a fresh read and, if the pen is
  ours, reported rather than declined. The change did not apply and is **not re-sent**, so the person is told once:
  "You were away, so that change was not saved. Try it again." The banner is the workspace's refused-write banner at `info`
  (polite), the **only** thing that speaks it. Dismiss hands focus to the plan surface first (WCAG 2.4.3). The notice
  clears on Dismiss, on Stop editing, when it is replaced, and when the next write made through a mutation is accepted
  (writes made any other way leave it until Dismiss). While shown it pushes the diagram down by its own height, about a sixth
  at 1024 × 600, as the export-error banner does. A write refused while a colleague holds the plan gets the lost-control
  sentence instead, and no notice.
- **The view is deliberately not refreshed while resting.** The screen keeps reading "Editing" until the next input, even if
  a colleague has taken the plan in the meantime: refreshing it would flip the pen and announce it to someone who is away.
  The first input re-reads and corrects it.
- **Resting survives a re-render** (_found in review, 2026-11-13_). The flag lives in a ref shared with the status query and
  is cleared only by an input, by the tab ceasing to hold, or by a hidden tab returning, never by an effect re-running:
  the first build cleared it in the input listeners' cleanup, which ran on every render of the host, so a timer elsewhere
  woke a resting tab without input.
- **The one-silent-retake cap is unchanged** (`retakenRef`, reset only by an accepted beat): resetting it on a successful
  retake would let a lease the server keeps refusing be retaken for ever, which is what the cap exists to stop. The cost is a
  window of up to one beat (30 s) in which a second real loss reads as a loss, which it is.
- **Nothing is announced.** No new sentence, control or request. Rollback is pinning `WEB_IMAGE_TAG`; no flag (D6), no
  API or schema change. Web minor.

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
  that and the plan is free 120 s after that. A **visible** tab nobody touches lets go after 30 minutes (D8), with the same 90 s and 120 s
  after that; the one exception is a tab whose editor holds **unsaved typed changes**, which keeps the pen for as long
  as they are there, as it did before D8. Someone who types into an editor and walks away therefore still holds the
  plan. That is deliberate: no typed work is put at risk, and it is revisited only if it is reported.
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
- D7: the foot row's pen cluster gains a button in its two tightest states, so those states are held to the 1024 × 600
  floor by a journey (`e2e-edit/pen-handoff.spec.ts`). A reloaded requester takes the pen when the holder leaves, which
  is what the waiting sentence always promised.
