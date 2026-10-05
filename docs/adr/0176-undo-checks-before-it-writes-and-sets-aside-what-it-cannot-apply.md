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

Specified in the feature spec §4.6 and delivered by M3 (2026-10-05):
`apps/web/src/features/undo-redo/coverage.ts` lists every mutation hook the plan workspace reaches as
`recorded` (naming its command builder) or `excluded` (with a written reason), and
`coverage.census.structural.test.ts` fails the unit suite — and so `pnpm prepush` — when a hook is in
neither, or an entry names a hook nothing reaches. Hooks are found by structure (a body that calls
`useMutation(`), not by a verb in the name. It is a tripwire, not a classifier: it proves a decision
was written down, not that a `recorded` seam is wired at every host.

### D7 — A dissolve is one step: restore the summary, then file its children back (M6, 2026-10-05)

`dissolveCommand` (`apps/web/src/features/undo-redo/commands.ts`) replaces the history truncation both
dissolve surfaces used to perform. `restore-batch` brings back the summary **alone** — the promotion is
not undone with it — so undo is two writes: the id-stable restore of the batch the dissolve response
named, then one all-or-nothing `updateParents` that writes **only** `parentId`, at the versions a fresh
read finds. Redo dissolves again and **rethreads the new batch id**, as a delete's redo does.

- **Checked before either write.** Every promoted child must still hold the parent the dissolve gave
  it. A child a colleague moved or deleted sets the whole step aside (`changed` / `gone`) with
  **nothing written** — the summary is not restored, because restoring it and then refusing to file its
  work would leave a half-undone grouping for no gain.
- **The half that can still fail is the re-file.** If the restore lands and the re-file is refused
  (409/404), the restored summary is **left** — visible, empty and harmless — and the step is set aside
  with the new reason `unfiled`, whose words say the children were not moved back ("“X” is back, but
  its activities could not be moved back under it, so that step was skipped"). A transport failure
  there is a `ReplayFailure` saying the same, and a retry re-files without restoring twice.
- **Redo is a delete's guard** (`checkDeletable`): refused if the summary was edited, linked, or given
  a child the step did not put there, since a dissolve would promote a colleague's work out of the
  phase with the planner's.
- Audit reads `activity.restored` after `activity.dissolved` for an undo, as Recently deleted already
  does for any restore. The coverage census (D6) now lists `useDissolveSummary` as `recorded`.

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

- **What a press costs.** A step that names five rows or fewer (`SINGLE_READ_LIMIT`) is checked
  through the per-row endpoints, in parallel: one `GET …/activities/:id` or `GET …/dependencies/:id`
  per row, a 404 meaning "gone". A step above that walks the plan's list once. The list is **paged and
  walked sequentially** (`apiFetchAllPages`), a request per hundred rows — about twenty round trips on
  a 2,000-activity plan before the write can start — which is why a single-row step must not pay it.
  A press that **applies** also pays the walk afterwards: every mutation invalidates the plan's lists
  and the views refetch them, which this decision did not add and cannot remove. **Not benchmarked**;
  the figures above are the shape of the cost, not a measurement.
- **A step that deletes checks more than its own fields.** Deleting cascades a row's links and a
  summary's subtree, and a delete sends the version it has just read, so the optimistic lock cannot
  object. Add-undo, delete-redo, the copy's undo, the level-of-effort span's undo and bulk-delete redo
  therefore compare the definition the step left and refuse any link, or any child under a summary,
  that the step did not itself put there — reading the links on the row (per row for a few, one list
  walk for many). A bar whose link was changed by a colleague, and whose own step was therefore
  skipped, can in turn not be removed by the step that created it: the link is still there.
- **A type change across the zero-duration milestone convention re-expresses dates the step does not
  compare** (ADR-0162): the server moves them, so neither the check nor the write carries them. A
  colleague's edit to such a date alone is therefore not noticed. Accepted.
- **Single-row `DELETE` is unversioned**, so the check-then-delete has a window of one round trip in
  which a colleague's write is deleted with the row. The API is not changed here; `docs/TECH_DEBT.md`
  #450 proposes an optional version on `DELETE`.
- A set-aside step is gone from the history. The strip says so, says why, and calls it "skipped" —
  nothing was removed from the plan, and the planner can make the edit again by hand.
- **A record with no restore endpoint is identified by what it joins, not by its id.** An assignment
  is deleted softly and has no restore, so undoing a removal re-creates it under a new id; every later
  step that named the old id would otherwise address nothing. A resource is assigned to an activity at
  most once, so the pair (activity, resource) is the identity assignment steps read and write by. A
  cross-plan link tracks its live id inside its own step. Making a resource the driver moves the
  previous driver off in the same request, so reversing it writes two rows — both are checked first,
  and the previous driver is put back **before** the delete, so a failure between the two leaves one
  driver rather than none. Not atomic, and not pretended to be.
- **A write that makes a resource the driver is checked for whom it displaces** (M3 review). The server
  clears whoever drives the activity in the same request, so a redo of "became the driver", the undo of
  "stopped driving" and a re-created driver may displace only the driver the step already expects; any
  other is a colleague's change the step never compared, and the step is set aside. Whom a replay
  displaced is remembered per direction, so the next reversal puts back the driver it actually moved.
- **Putting a driver back and the delete/PATCH after it are two requests**, and so is the edit's own
  write followed by the driver's. Both rows are checked first; a failure between the two writes leaves a
  coherent activity but a half-applied step, and is not compensated — the second write's refusal reads
  as a set-aside although the first landed. Accepted: the window is one round trip and the state is
  never driverless.
- A PATCH cannot clear an assignment's rate (ADR-0040), so undoing an edit that **set** one deletes and
  re-creates the assignment without it. The delete is unversioned (`docs/TECH_DEBT.md` #450 now covers
  assignments), so a create that fails afterwards is **compensated** by re-creating the row as it was
  read, and reported as a distinct failure — "put back as it was", or "could not be put back, assign it
  again" — never as a set-aside, and in the strip itself (a `ReplayFailure` carries the sentence; the generic retry line would hide it). If a colleague has assigned the resource again meanwhile, it says "it is there now" instead, and the compensating create puts a driver back as a non-driver when somebody else drives by then. A lost pen (423) still runs the pen contract, beside that sentence. That case does not replay
  `editedField`, so a duration the edit derived is not recomputed. A target the PATCH cannot express
  (a null actual cost) sets the step aside instead of reporting a partial undo as applied.
- **Identity is the resource, which has one consequence worth stating:** a colleague who deletes an
  assignment and re-adds the same resource with identical values has the new row found — and removed by
  the step's undo — because it is indistinguishable from the one the step made.
- A cross-plan create the server refuses as a duplicate or as a programme cycle
  (`DUPLICATE_CROSS_PLAN_DEPENDENCY`, `CROSS_PLAN_CYCLE_DETECTED`) is set aside with the duplicate
  wording, not as a generic change. The wording says "link", which also reads for an assignment
  duplicate; it is not yet specific. Cross-plan links are created from whole days (`lagDays`), which is all the form
  offers.
- Inverses are field-scoped, so a command written against the old whole-definition contract does not
  type-check — the census in D6 is what keeps a new write path from being forgotten.
- The mutation functions are still closed over by each builder rather than supplied by the replay
  context; supplying them was said to be deferred to the history list (M7), "the first thing that
  replays a step recorded in an earlier render". **That was wrong** — every ordinary undo replays a
  step recorded in an earlier render — and the M7 addendum below records what it actually did.

## Addendum — what a press shows (undo-redo M4, 2026-10-05)

- **A command names the activities it touched** (`Command.subjects`, activity ids in the order a
  planner should be shown them: a link names both its ends, a record owned by an activity names that
  activity, a cross-plan link names its own plan's end first). The field is required, so a new family
  cannot forget it. It is a flat list for now; the spec's richer `{ activities, dependencies, other }`
  shape was said to wait for the history list (M7) as "the first reader that needs links as
  subjects" — it did not need them (see the M7 addendum), so the shape stays flat.
- **After an applied step the first subject still in the plan is selected and brought into view**, in
  whichever view is showing, through the channels duplicate and the dock presses already use: the
  one-shot `revealActivityId` (bring the bar into view on both axes with `centerOnActivity`, lift the selection) and the
  Gantt's `bringIntoViewActivityId`. "Still in the plan" is read from the plan's list after the
  replay's own invalidation has settled, so an undone create reveals nothing and the dates centred on
  are the restored ones. A set-aside or failed step reveals nothing.
- **The Gantt's request is withdrawn once it has scrolled** (`onBroughtIntoView`), so it cannot re-expand an
  ancestor the planner collapses afterwards. **A select signal moves the diagram's keyboard cursor as
  well as its selection**: with multi-select on, `aria-activedescendant` names the cursor, and the
  signal had left it on the row the planner last walked to (found by the journey, not by a unit suite).
- **Focus is not moved.** The diagram's select request is made with `focusListbox: false` unless focus
  has already fallen to `<body>`, in which case it is handed to the diagram (ADR-0135). Both scrolls are
  instant (`centerOnDate` is a pure pan; the Gantt calls `scrollToIndex` with no smooth behaviour), so
  there is no animation for reduced motion to govern.
- **A plural step reveals its first subject only**: the diagram reports its selection outward and has no
  inbound set API (ADR-0080), so there is nothing to hand a set to.

## Addendum — the history menu (undo-redo M7, 2026-10-05)

- **"Undo to here" is the single-step workflow run `k` times, and it STOPS at the first step that
  does not apply** (the spec's §2.3 wording, "stopping at the first non-success"). It does not skip
  the step and carry on: the steps below it were made on top of it, so reversing them anyway would
  undo edits whose base is no longer there. The stopped step is set aside as usual (D3), so the
  planner can press Undo again to go on past it. A step that fails in transport stops the run the
  same way and stays on the stack; a lost pen runs the pen contract and posts nothing (the banner is
  its one announcer), but the steps that did run are still recalculated.
- **One result for the whole run**, not one per step: `HistoryResult.steps` carries `{ done, total }`
  and the message is "Undid 4 steps." or "Undid 2 of 4 — stopped at ⟨label⟩: ⟨reason⟩." A run that
  stops on its first step has done nothing, so it posts the ordinary single-step result. The
  recalculation and the reveal happen once, for the steps that ran (the reveal is the last step's
  first subject still in the plan).
- **A run holds its own in-flight guard.** The store's guard drops between two awaited steps, so a
  keystroke could have slipped a single undo into the middle of a run; `usePlanUndoRedo` holds a
  second ref across the whole run and a single press is ignored while it is set.
- **Entries are read when the menu is open, not carried as state.** `PlanEditHistory.entries()` returns
  the labels of both stacks nearest first, read from the refs; it is a stable callback, so the
  object the toolbar-context memo keys on does not change when a step is recorded.
- **The control is a menu button beside Undo, named "Undo history"** (the activity editor already has
  a History tab, ADR-0174): a registry item (`undo-history`, pen-gated, enabled while either stack is
  non-empty) on the shared APG `Menu`, in the toolbar both views mount. Undo above redo, nearest
  first; each row says what it does to a screen reader ("Undo 3 steps, back to …"). Redo is in the
  same list because the cost was one section and the symmetry is what a planner who has just undone
  too far reaches for.
- **The two deferrals above did not hold.** Replaying a step recorded in an earlier render is what
  every undo does, so the history list did not need the mutations moved into the replay context; and
  it needed labels only, so `subjects` stays a flat id list.

## References

- [`docs/adr/0048-undo-redo-command-stack.md`](0048-undo-redo-command-stack.md) — amended here.
- `docs/TECH_DEBT.md` #447 (the version ledger this supersedes).
