# ADR-0198: A guest sees what is near critical and what drives

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Product owner (2026-10-17: Q1 accepted — guests see both the near-critical rung and the driving links)
- **Amends:** ADR-0051 §4 (the `SCHEDULE_READ` guest scope)
- **Follows:** ADR-0163 (the last widening of that scope, and the ADR that filed this gap)
- **Spec:** [`docs/specs/guest-critical-cues/`](../specs/guest-critical-cues/) (`docs/TECH_DEBT.md` #403)

## Context

The share view's legend promises a near-critical rung and heavier driving links, and its canvas never draws
either: the API withheld `Activity.isNearCritical` and `ActivityDependency.isDriving` with no written reason, and
the web adapter hard-coded both to `false`. The guest already reads `nearCriticalCount` in the schedule summary,
so it was handed a count without its members, and every link with a drawn gap carried a gap label a member sees
only on a non-driving link.

## Decision

**D1 — `SCHEDULE_READ` gains `Activity.isNearCritical`.** The flag is `!isCritical && 0 < totalFloat ≤ 7,200
working minutes` (`engine/compute.ts`, `engine/constants.ts`). Its inputs are `isCritical` and `totalFloat`, both
already exposed, the activity's day factor (recoverable from the exposed `durationMinutes` and `durationDays`)
and a product constant that is the same for every plan. Its count is already public as `nearCriticalCount`. What
is new is only _which_ activities make up that count. No cost, resource, constraint, note or person is an input.

**D2 — `SCHEDULE_READ` gains `ActivityDependency.isDriving`.** The engine-owned link flag: true when the link
sets its successor's early start. It is one bit per link, computed over two inputs the guest cannot see (the lag
calendar and the successor's calendar), and so recovers neither. **`ResourceAssignment.isDriving` (which
resource drives) stays excluded**; it is a different field and `resourceAssignments` remains forbidden on the
wire. The residual inference is accepted in words: for a not-yet-started activity with incoming links, none of
which drives, something other than logic holds its start — a constraint, an external early start, or the data
date. A guest can learn that such a bound may exist, but not which, its type or its date. That is the same
partly-derivable kind of disclosure ADR-0163 accepted for drift and remaining float, not the planner's-working-
notes kind it refused (`visualConflictReason`). The driving chain also becomes explicit when combined with
`isCritical`, which is the critical path ADR-0051 §4 already promises.

**D3 — The spoken sentence says "near-critical" without a figure**, because `remainingFloat` stays excluded.

## Alternatives considered

- **Keep both excluded and remove the legend rows on the guest.** The guest would be shown less schedule than
  ADR-0051 §4 promises, and the count would stay without its members.
- **A per-link opt-in scope.** ADR-0051 rejected per-link scoping on YAGNI grounds and ADR-0163 did not reopen it.
- **Derive the cues client-side from exposed dates.** Wrong exactly where calendars differ, and it would put a
  second, inexact copy of engine logic in the web app.

## Consequences

- **It applies to every live link** on release. ADR-0051 has no per-link scope column. The changesets say so.
- **No engine, service or schema change.** `share-guest.service.ts` has no diff and both columns are already
  loaded; only the two DTO mappers change. The ADR-0034 recalculation parity gate is untouched.
- **Version skew is safe.** The API and web images auto-pull independently (ADR-0047). The web adapter reads an
  absent key as `false`, which is the previous picture; an older web bundle ignores the extra keys.
- **Guest and member agree by test**, not by assumption: `guest-dto.spec.ts` pins both exact key sets with a
  fixture whose `isNearCritical` is `true`, and `share-guest.e2e-spec.ts` asserts the guest and member reads
  are equal, with in-case preconditions that each value occurs.

## References

- `docs/specs/guest-critical-cues/spec.md` — §0 (what was checked), §4.5 (security reasoning), §4.7 (this
  ADR's outline).
- ADR-0051 §4; ADR-0163; ADR-0151 (the near-critical rung); ADR-0154 (link weight shows what drives).
