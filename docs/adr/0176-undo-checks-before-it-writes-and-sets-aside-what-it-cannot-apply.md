# ADR-0176: Undo checks before it writes, and sets aside what it cannot apply

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** James Ewbank (product owner — approved 2026-10-04: plan settings stay outside undo;
  the result lives in the dock strip), with Claude Code
- **Amends:** ADR-0048 (the "Conflict = abort-and-refetch" and "Bounded & session-scoped" Decision
  bullets)
- **Builds on:** ADR-0028 (the pen), ADR-0032 (coalesced recalculation), ADR-0088 D1 (no flag),
  ADR-0132 (one utterance per event), ADR-0162 (milestone date convention)
- **Spec:** [`docs/specs/undo-redo-best-in-class/`](../specs/undo-redo-best-in-class/feature-spec.md)
  §4.3, §4.5, §4.9; `docs/TECH_DEBT.md` #447

## Context

Three things in the undo stack were wrong together, and each made the next worse.

**A refused step blocked everything beneath it.** An inverse that came back 409 or 404 aborted,
refetched and cleared redo — and left the step on top. The next press ran the same step and was
refused the same way, so every earlier step was unreachable until a reload, which also destroyed the
history (`use-plan-undo-redo.ts` at the base of this work: the 409/404 branch calls `clearRedo()`
and nothing pops).

**The only guard against overwriting somebody else was an accident.** A command captured the version
its forward write returned, so after a colleague's write the replay sent a stale number and got a 409. #447 fixed the real defect underneath (two steps on one row stale-409 each other) with a
per-history version ledger fed only by writes the stack itself recorded or replayed. That kept the
protection — an unrecorded write still bumps the row past the ledger — but it is still a version
comparison, which cannot tell "somebody changed the field my step wrote" from "somebody changed an
unrelated field", so it refuses both.

**Inverses resent the whole definition.** `definitionSnapshotCommand` re-PATCHed every definition
field on every undo. That silently reverts a later edit to a field the step never touched, and it
resends dates alongside a type, which the server reads in the new type's convention — the editor's
Make-milestone conversion (spec F-3). The dedicated `typeChangeCommand` already sent the type alone
for exactly this reason; the editor's path did not.

## Decisions

### D1 — A command declares what it touched and what it wrote; one interpreter replays it

A step is built from the rows it touched and the field values it wrote
(`apps/web/src/features/undo-redo/commands.ts`). A replay returns `applied` or `not-applicable`
(with a reason and the name to say). Builders stay pure: they close over their mutation functions,
not over React.

### D2 — A replay checks the fields it wrote against a fresh read, and writes only those fields at the row's current version

Before writing, the replay re-reads the touched rows (`fetchQuery`, `staleTime: 0`, so the same read
refreshes what the views draw from) and compares **only the fields the step wrote** with the state it
left. A match writes just those fields, with the version the read returned. Unrelated fields may have
changed. A multi-row step is all-or-nothing: one failing row sets the whole step aside and nothing is
written. The #447 version ledger is deleted, because the read now supplies the live version.

**What is compared is the server's saved row, never the value the client sent.** The server
normalises (a milestone's re-expressed dates, a snapped placement), so comparing what was sent would
refuse a perfectly good undo. After a replay applies, the opposite direction's expectation is
refreshed from that write's response, for the same reason. The dates the server re-expresses when a
zero-duration activity's type crosses the finish-milestone convention are consequences of the type
change, not things the planner wrote, and are neither compared nor sent.

### D3 — A step that cannot apply is set aside and explained; the next press continues

`not-applicable` pops the step, clears the redo branch (nothing built on a step that did not apply
may be redone), ends the coalescing window, and reports through the dock strip (`role="alert"`, one
utterance) in words that name the subject, say the step was set aside, and name what the next undo
runs. A 409 or 404 between the check and the write reads the same way (`changed` / `gone`); the
server's own reasons keep their words (`PARENT_DELETED`, `DUPLICATE_DEPENDENCY`). **Nothing chains**:
one press does one thing the planner can see. A transport failure is not a set-aside — it throws, the
step stays on top, and the strip offers **Try again**.

### D4 — History survives a pen hand-off; reload and plan switch still end it

A 423 runs the shared pen contract (the banner is the single announcer) and **keeps** the history; the
controls shade until the pen is back. This is safe because every step is checked before it writes:
what ADR-0048 reached for by clearing the stack is now structural. `sessionStorage` was considered and
rejected again (commands would have to become serialisable data, and after a reload the client cannot
know what changed in between).

### D5 — Every replay that touches a scheduling input notifies recalculation

Delivered in M0 (#795), recorded here because it is the same contract: a layout-only command says
`affectsSchedule: false`; every other replay asks the ADR-0032 coalescer to recalculate.

### D6 — Coverage is a computed census with a written exclusion list

Specified in the feature spec §4.6 and delivered by M3; named here so the contract is one decision.

## Alternatives considered

- **Keep abort-and-refetch.** The dead end this removes.
- **A server-persisted undo log.** ADR-0048's reasons still hold, and the pen already makes editing
  single-writer.
- **Compare whole rows.** Spurious refusals after any unrelated edit — the version ledger's failure,
  one level up.
- **A version-only check.** Fails across one's own later steps on the same row, which was #447.
- **Skip refused steps automatically in one press.** One keypress would change several things the
  planner cannot see.

## Consequences

- One extra read per replay (the plan's activity or dependency list, filtered), human-paced; a
  bulk step reads once, not per row. It is the same `apiFetchAllPages` read the views already make,
  so a 2,000-row plan costs a few pages per press. **Not benchmarked** — the spec's budget claim
  (spec §3, "one extra read") stands unmeasured, and a slow press on a very large plan is the signal
  to add a single-row GET for single-row steps.
- A set-aside step is gone from the history. The strip says so and says why; nothing was removed from
  the plan, and the planner can make the edit again by hand.
- Inverses are field-scoped, so a command written against the old whole-definition contract does not
  type-check — the census in D6 is what keeps a new write path from being forgotten.
- The mutation functions are still closed over by each builder rather than supplied by the replay
  context; supplying them is deferred to the history list (M7), which is the first thing that replays
  a step recorded in an earlier render.

## References

- [`docs/adr/0048-undo-redo-command-stack.md`](0048-undo-redo-command-stack.md) — amended here.
- `docs/TECH_DEBT.md` #447 (the version ledger this supersedes).
