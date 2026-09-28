# ADR-0163: A guest sees the plan as placed

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Product owner (2026-09-28: "a guest sees the placed bars")
- **Amends:** ADR-0051 §4 (the `SCHEDULE_READ` guest scope)
- **Caused by:** ADR-0148 (Visual is the plan; the collapse of the scheduling modes)
- **Spec:** [`docs/specs/guest-placed-bars/`](../specs/guest-placed-bars/) (`docs/TECH_DEBT.md` #356)

## Context

A share link is how a planner hands a schedule to someone who was not in the room: a client's
owner rep, or a subcontractor (ADR-0051 context, `docs/adr/0051-external-guest-share-links.md:20-25`).
Since ADR-0148 collapsed the scheduling modes, **the placed span is the plan**
(`docs/adr/0148-visual-is-the-plan.md:48-50`): the member canvas draws
`visualEffectiveStart`/`visualEffectiveFinish` for every plan (`lib/bar-dates.ts:54-56`,
`plan-workspace-toolbar.tsx:488`). The guest canvas still drew the CPM **early** dates, because
(1) the guest API never sent the placed span at all (it was on the forbidden list,
`guest-dto.spec.ts:143-144`), (2) the web adapter filled the gap in with `null`
(`guest-api.ts:230-231`), and (3) `GuestPlanView` passed no `barDateSource`, so `TsldPanel` fell
back to its `'early'` default (`TsldPanel.tsx:655`, `GuestPlanView.tsx:255-262`).

**The collapse took information away from guests without anyone deciding to.** Before ADR-0148, a
drag on an `EARLY` plan wrote a binding `SNET` at the drop date, and a binding `SNET` sets
`early_start = constraint_date` — so the guest **was** shown the dragged position, through
`earlyStart`. After the collapse, the same drag writes a placement, and a placement does not move
`earlyStart`. The member's bar stayed put; the guest's bar moved to the network's earliest date, a
date the planner never chose. Nobody widened or narrowed the guest scope on purpose — the ground it
stood on moved underneath it.

Reading the code for this ADR turned up a second, more urgent defect the register row did not
carry: **the guest's accessible channel says every activity is unscheduled.** `TsldPanel` builds
the listbox text through `describeActivity(a, { overlapsInLane, withCodes })` and does not pass
`barDateSource` (`TsldPanel.tsx:1170-1173`); `describeActivity` then falls back to its own default,
`'visual'` (`render/a11y.ts:166`). The guest adapter sets `visualEffectiveStart: null`
(`guest-api.ts:230`), so the sentence takes the `drawn.start === null` branch and reads
`"<name>, <n> working days, not yet scheduled"` (`a11y.ts:167`). A sighted guest was shown bars at
the early dates; a screen-reader guest was told no activity had dates at all. The two disagreed
with each other and both differed from the member view — a WCAG 1.1.1 failure on the one screen an
outsider meets. Widening the guest scope so the adapter carries the placed dates makes the listbox
default (`'visual'`) correct for the guest too, repairing both channels with the one change.

A neighbouring finding is **not** folded into this widening: a **member** with the Late overlay
switched on is read the placed dates rather than the late ones, because `TsldPanel.tsx:1170` never
passes `barDateSource` to `describeActivity` at all — the caller's source is supposed to be
authoritative (`a11y.test.ts:372-381`), and for this one call site it is not. That is a member-side
defect independent of the guest scope and is filed rather than fixed here (spec §4.8, `docs/TECH_DEBT.md`).

## Decision

`SCHEDULE_READ` (ADR-0051 §4) widens by exactly two fields: `GuestActivityDto` gains
`visualEffectiveStart` and `visualEffectiveFinish` — the same day-formatted columns the member DTO
already exposes, copied through the same `day()`/`formatCalendarDate` helper so a `FINISH_MILESTONE`'s
end-of-day date (ADR-0155) reads identically on both surfaces. The guest canvas draws on the
**placed** basis (`barDateSource={barDateSourceFor(false)}`), which is what the member canvas has
drawn on since ADR-0148; a structural census (`guest-bar-basis.structural.test.ts`) pins every
production `<TsldPanel>` host to state its basis explicitly, so no future host can inherit the
`'early'` default by omission the way this one did.

The four neighbouring fields stay excluded, each for a reason stated rather than assumed:

- **`visualStart`** — the authoring INPUT (which bars a person pinned by hand), not reliably
  reconstructible from the effective span: an unplaced successor pushed by a placed predecessor
  also draws later than its early start, so a guest cannot tell "placed" from "pushed" by
  comparing dates alone.
- **`visualConflict`/`visualConflictReason`** — a guest is shown where the work sits, never the
  planner's working notes about WHY a placement is contentious. `LATER_THAN_BOUND` would also
  reveal that a constraint exists, and constraints are already out of scope.
- **`visualDriftDays`/`remainingFloat`** — a float is analysis, not the schedule a share link
  exists to show. A guest can estimate these from what IS exposed (see Consequences); the exact
  engine figures stay a separate, unmade decision.

No route, no query parameter, no schema change and no engine call are added. The token is still the
entire scope (`share-guest.service.ts:39-44`); `ShareGuestService.listActivities` is unchanged, and
`GuestActivityDto.from` copies two more columns the way it already copies the early dates.

## Alternatives considered

- **Keep drawing the computed (early) bars.** This is the defect: the guest sees a schedule the
  planner never chose, and after ADR-0148 the computed dates are not "the plan" for anyone.
- **Draw both the early and the placed bars.** Puts two positions for one activity in front of a
  reader who was not in the room to know which one is real, and doubles the guest canvas's paint
  cost for no benefit the product owner asked for.
- **A per-link opt-in scope column** (let the planner choose what a given link shows). ADR-0051
  already rejected per-link scoping on YAGNI grounds (`:235-237`); this ADR does not reopen that,
  and inventing a schema column for a choice nobody has asked for is premature.

## Consequences

- **It applies to every live link.** ADR-0051 has no per-link scope column, so every existing share
  starts showing placed bars the moment this release ships. This is intended — it is exactly the
  decision the product owner made — and the changeset says so in words.
- **Drift, remaining float and some placement conflicts become partly derivable, and that is
  accepted.** A guest who compares `visualEffectiveStart` with `earlyStart` (both now exposed) can
  estimate how far a bar sits from its network-earliest date, and — combining that with the
  already-exposed `totalFloat` and the plan's calendar — estimate the remaining float. Some
  placements that violate logic (`placed < logicEarliest`) become inferable as a bar drawn before
  its own early start; whether every flagged case is visible this way is not established, because it
  depends on how the placed-basis engine pass's logic-earliest compares with the network pass's
  `earlyStart` in every shape, so this is stated as **partly** derivable rather than fully.
- **The `ADR-0034` recalculation parity gate is not touched.** No engine code is imported by this
  change; the two columns read are the ones already written on every recalculation
  (`schedule.repository.ts:862-863`), and `share-guest.service.ts` carries no diff.
- **A version-skew fallback keeps the product correct across an independent deploy.** The API and
  web images auto-pull independently (ADR-0047). If a response carries no `visualEffectiveStart`
  key at all (an older API), the adapter falls back to the early dates — today's picture, never a
  blank diagram. If the key is present and `null` (the plan has never been calculated), nothing is
  drawn, exactly as for a member.
- **The member-side sibling defect (`TsldPanel.tsx:1170` not passing `barDateSource` to
  `describeActivity`) is filed, not fixed, here** (spec §4.8; register row to follow M3).
- **The near-critical rung (ADR-0151) and driving-link weight (ADR-0154) remain excluded from the
  guest canvas with no written reason** (`guest-dto.spec.ts:136, :266`), which is inconsistent with
  `nearCriticalCount` being exposed in the schedule summary. Each is its own `SCHEDULE_READ`
  widening and is out of scope here (spec §4.6); filed for M3.

## References

- `docs/specs/guest-placed-bars/feature-spec.md` — §0 (what was checked), §4.5 (security
  reasoning), §4.6 (what "exactly what the planner sees" covers), §4.7 (this ADR's outline).
- `docs/specs/guest-placed-bars/implementation-plan.md` — M1 (the API widening), M2 (the web
  adapter, host basis and journey).
- ADR-0051 §4 (the guest scope this amends); ADR-0148 (Visual is the plan — the cause); ADR-0026 D7
  (the parallel accessible listbox); ADR-0081 (a milestone names its entry point and journey).
