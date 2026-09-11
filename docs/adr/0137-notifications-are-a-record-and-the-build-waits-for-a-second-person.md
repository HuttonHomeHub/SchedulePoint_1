# ADR-0137 — A notification is a record, and the build waits for somebody to notify

**Status:** Accepted (decision only — **nothing is built by this ADR**)
**Date:** 2026-09-11
**Builds on:** ADR-0075 (mail is best-effort and its failure belongs to the operator), ADR-0073
(which mutations earn an audit event, and the two tests that decide), ADR-0012 / ADR-0016 (roles and
tenancy), ADR-0028 (the single-editor pen), ADR-0087 (the retention scheduler, and D2's trigger for
reopening ADR-0009).
**Amends:** `docs/BACKLOG.md`'s **Notifications** `M`, which is rewritten from "needs a decision
about which events and what channel" — that decision is taken here — to a designed capability
waiting on a trigger.
**Supersedes:** nothing.
**Spec:** [`docs/specs/notifications/`](../specs/notifications/) (feature spec + implementation
plan, both complete and approved as a design).

## Why this is an ADR and not a ticket

`docs/BACKLOG.md` carried **Notifications** as an `M`, sized as work, and the product owner asked
for it to be specced. The spec was written. It is complete, it is good, and its own recipient rule
disqualifies building it today — which is a decision worth recording rather than a task worth
queueing.

This is ADR-0085's shape one feature along: a backlog row sized as work, which reading turns out to
be a decision with a precondition at its centre. Picked up as a ticket, somebody builds seven
milestones and a new table and observes no change in the product, because there is nobody to notify.

## The precondition, which is the whole decision

The spec's recommended recipient rule (§4.1, CQ-2 option (a)) is:

> Every member holding a write permission, **minus the actor**.

This installation has **one member**. Minus the actor, that set is empty — for every event kind, on
every plan, always. The feature would not be low-value; it would emit **zero rows**, render an empty
inbox, and send no mail. Its observable behaviour and its absence are identical.

That is not an argument against the design. It is an argument that the design's value is a function
of a number the installation does not yet have, and **notifications are the clearest case in the
register of a feature whose worth is entirely a property of the deployment rather than of the
code**.

### D1 — The build is deferred on a named trigger

**Trigger: a second person holding a write permission in any organisation.** Not "more usage", not
"when it feels worth it" — a checkable fact, because ADR-0085's own closing line is that an
unconditioned `M` stays exactly one priority below whatever is being done, and that is how this row
sat for a month with a blocker that had already lapsed.

It is deliberately the **same trigger** ADR-0085 names ("the first organisation outside the product
owner's own, or a real subject request"), and the overlap is not a coincidence: both features exist
to serve people who are not the person who built the product, so both are inert until one arrives.
A single event fires two pieces of designed, unbuilt work, which is a reason to write the trigger
down once and well.

## The decisions that stand whenever it is built

The deferral does not put the design back in the drawer. Three things are settled now, because they
were established by reading the code rather than by preference, and re-deciding them later would
mean re-doing that reading.

### D2 — The notification **is** the durable row; a channel is a best-effort pointer to it

Forced, not chosen. `MailEvent` records **failures only** — `FAILED` and `ABANDONED` — so there is
no record anywhere of a successful send, deliberately (ADR-0075). A mail-only design therefore
cannot re-show a notification, cannot mark one read, and cannot honestly describe its own state; a
silent delivery failure loses the notification outright, with nothing able to report that it
happened.

A second, independent argument converges on the same answer, and it is the stronger one:
**membership can be revoked between emission and delivery.** A mail carrying plan content is a copy
of organisation-scoped data sitting in a mailbox, past the org-scope check that would by then refuse
it. A count and a link cannot leak that way — following the link re-runs the check and correctly
refuses.

**So the product never claims a message was sent.** It records that something happened and offers a
place to read it.

### D3 — Which events earn one is derived from two tests, not listed

The ADR-0073 method, with new tests because that ADR's two do not fit:

- **N1 — absence.** Is the person who needs to know necessarily somewhere else? An event whose
  consequence appears on a screen the recipient is already looking at needs no notification.
- **N2 — channel.** Will the channel arrive while the fact still matters? This one can disqualify
  an event outright rather than route it.

N1 decides _whether_; N2 decides _which channel_. Applied, they land on the audit log's
**blast-radius** subset plus hierarchy deletes — which is a good sign the rule is real rather than
reverse-engineered, since it reproduces an existing derived answer from different premises.

**This is not tailing `audit_events`,** and the distinction is load-bearing in both directions:
that table permanently excludes content edits (ADR-0073), so it cannot serve as a general event
source; and a notification must be suppressible by a recipient's preferences where an audit row must
never be.

### D4 — The pen hand-off is **not** a motivating case, and the epic's own premise was wrong

The backlog row, the product owner's question and my brief to the analyst all framed this as "a peer
requests the pen, the holder has 45 seconds, and email is too slow". That framing implies a faster
channel would help. It is wrong, and the correction is recorded here because it is the kind of claim
that otherwise gets re-made annually.

There are four relevant constants, not one, each read from the code on 2026-09-11:

- `canTakeOverNow` (`plan-lock.policy.ts`) returns true on `isHolderInactive(...)` **alone** — the
  grace clause is an `||` alternative, not a requirement.
- `LOCK_INACTIVE_AFTER_MS = 90_000`, so a peer takes the pen from an absent holder **without needing
  any response from them**.
- The client status poll is `POLL_MS = 15_000`, so a holder who is present is told within 15 s.
- `useLockHeartbeat` **already releases the pen** on unmount and `pagehide`, via a keepalive `DELETE`
  with a 120 s TTL backstop — so a holder who navigated away or closed the tab has released it.

**There is no state of the world in which mailing the pen holder changes the outcome.** The single
residual is a holder with the plan open in a background tab on a machine that is awake, and mail
does not serve that either. Filed as a residual rather than designed for.

## What is explicitly not decided here

- **CQ-1** (whether to add the cheap in-app middle option for the pen — a title flash and a toast on
  the existing poll), **CQ-2** (the recipient set) and **CQ-3** (whether mail ships in the first
  release) remain the spec's open questions. Deferring the build does not settle them, and answering
  them now would be inventing requirements for a deployment that does not exist.
- The M5 digest **fires ADR-0087 D2's own "fan-out" trigger** for reopening ADR-0009 (BullMQ +
  Redis). That stays true whenever the build happens and is recorded in the plan rather than
  smuggled past it.
- Nothing about the **schema** is decided. The plan opens a `database-architect` task at three
  points, per CLAUDE.md §19.3, and deliberately hands that agent four questions rather than
  prescribing answers — including one that could break production: a foreign key from `notifications`
  to a hard-deletable plan would make the ADR-0096 expiry fail on exactly the busiest organisations,
  which is that ADR's own D5 finding.

## Consequences

**The spec is not shelved; it is loaded.** When the trigger fires this is a build with its design
done, its measurement conditions written (M0 commits three falsification bars before any harness
runs), its first user-facing milestone and entry point named (M2, `/me/notifications` off the
account chip), and its riskiest task already isolated — the import producer, which must **not** sit
in its transaction, because phase 2 hard-deletes the plan when recalculation fails and the row would
outlive its subject.

**The honest cost of this ADR is that a reader may now under-rate the feature.** "Deferred" reads as
"weak", and this one is not weak — it is inert. The day a second planner joins, a data-date move or
a shared-calendar edit silently re-dates somebody else's work with no way for them to learn it
happened, and that is the day this becomes one of the more valuable things in the backlog. The
trigger exists so the transition is noticed rather than argued about.

**A process note worth keeping.** This is the delivery process working as intended: one agent run
produced a spec whose job was to answer _should we build this_, and the answer was no. That outcome
is cheap and correct, and it is the second time in the register (after ADR-0085) that a full spec's
most valuable output was a decision not to proceed. A spec that declines is not a wasted spec.

**The CPM engine is not imported and no migration runs** — in its honest form: nothing is built at
all, so there is nothing to hold parity for.
