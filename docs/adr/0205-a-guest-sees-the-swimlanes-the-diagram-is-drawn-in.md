# ADR-0205: A guest sees the swimlanes the diagram is drawn in

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Product owner (swimlanes spec SQ-4, default "yes": guests see swimlanes, with the same on/off control)
- **Amends:** ADR-0051 §4 (the `SCHEDULE_READ` guest scope)
- **Follows:** ADR-0163 and ADR-0198, the two earlier widenings of that scope
- **Spec:** [`docs/specs/swimlanes/`](../specs/swimlanes/) (feature-spec US-6 and SQ-4, implementation-plan M4-T3)

## Context

Swimlanes (labelled horizontal bands on the diagram) are drawn for members. The share view is the same
diagram, read-only, for someone outside the organisation. ADR-0051 §4 lists what a guest may read and says
everything else is excluded by construction, so a guest who is shown the plan's bars but not the bands the
planner drew them in is shown a different picture from the one the planner sent them.

Two columns already exist on the activity row and neither can be copied to a guest as it is. `swimlaneId` is
kept while a plan's source is not hand-made (so that switching back restores the assignment) and may name a
swimlane that has since been deleted. `swimlaneLanes` carries one row per basis the activity was ever placed on,
with audit timestamps. Both are working state, not the picture.

## Decision

**D1 — `SCHEDULE_READ` gains the swimlane list and each activity's derived membership and lane.**

- The plan view (`GET /share/plan`) gains `swimlanes`: the plan's live swimlanes, in display order, as `{ id, name }`
  and nothing else. It is empty unless the plan's source is hand-made (`MANUAL`).
- Each activity (`GET /share/activities`) gains `memberOfSwimlaneId` (an id from that list, or `null` for "No
  swimlane") and `swimlaneLaneIndex` (the lane stored against that membership, or `null` when the activity has
  never been placed there).

Both are the same kind of fact as the `laneIndex` and the placed span a guest already reads: where the bar is
drawn. Neither adds a category of information about cost, resources, constraints, notes or people.

**D2 — Membership is derived on the server, by the rule the member diagram draws by.** An activity in a swimlane
that is in the live list reads its `SWIMLANE` lane row; everything else (no swimlane, or a swimlane since deleted)
is "No swimlane" and reads its `NO_SWIMLANE` row (`guest-swimlanes.ts`, mirroring `manualSwimlaneInput` in the
web). The raw `swimlaneId` and `swimlaneLanes`, the plan's `swimlaneSource` and `swimlaneWbsLevel`, a swimlane's
`position` and `version`, and the WBS `parentId` are **never** sent. `guest-dto.spec.ts` and the share e2e pin the
exact field lists and the absence of each.

**D3 — A plan whose swimlanes follow its WBS is shown without swimlanes, as a member sees it today.** That
source's swimlanes are the summaries at a level, in WBS order; no client draws them until swimlanes M3, and
deriving them here first would put the only copy of that ordering in the guest path. When M3 ships, this ADR's
shape is enough: the list and the per-activity membership are already source-neutral, and only the derivation in
`guest-swimlanes.ts` grows a branch.

**D4 — The guest has the same lens, and it is theirs alone.** The share view's View controls gain a **Swimlanes**
checkbox, shown only when the plan has swimlanes, defaulting to on, held in the page's state and sent nowhere.
The guest's listbox groups by swimlane exactly as a member's does, because both read the one projection.

**D5 — The stored lane rows' timestamps stay out.** The projection's tie-break for two stale rows that collide
in one swimlane is the later `updatedAt`. The guest is not sent it, so the guest breaks that tie by the lower
activity id. This can differ from a member's picture only for stale colliding rows, which a member also sees
settle on the next write into the swimlane; an audit timestamp is not worth disclosing to avoid it.

## Alternatives considered

- **Do not show a guest swimlanes (SQ-4 "no").** The smallest scope, but a shared programme that a client reads
  differently from the planner's printed one. The owner's default was "yes".
- **Send `swimlaneId` and `swimlaneLanes` as they are.** Two columns of working state, one able to name a deleted
  swimlane and one carrying audit timestamps, and the web would have to re-derive membership client-side with
  rules the server already owns.
- **Derive the final display lane on the server.** It would need the drawn spans, the data date and the bar-date
  source, which is the whole projection; the web already owns that and a second copy would drift.

## Consequences

- **It applies to every live link** on release; ADR-0051 has no per-link scope column. A plan with hand-made
  swimlanes is shown to its guests in them. The changesets say so.
- **No schema, engine or recalculation change.** The guest read adds one unpaginated query for the plan's
  swimlanes (bounded by the per-plan limit) and one for the page's lane rows, only when the plan has hand-made
  swimlanes. ADR-0034's parity gate is untouched.
- **Version skew is safe.** The API and web images auto-pull independently (ADR-0047). The web reads an absent
  list as "no swimlanes" and an absent membership as "none", which is the previous picture; an older web bundle
  ignores the extra keys.
- **Residual disclosure, stated:** a guest learns the names a planner gave the bands and which activities are in
  each. These are labels on the schedule being shared, chosen to be read.

## Amendment, 2026-10-25 ([ADR-0206](0206-a-swimlane-is-a-projection-of-lanes.md))

Swimlanes M3 (WBS swimlanes) has shipped, and D3 still stands: a guest sees no swimlanes on a plan whose
swimlanes follow its WBS. The owner chose on 2026-10-25 to keep it as a follow-on. The DTO is source-neutral, so
building it is a new branch in `guest-swimlanes.ts` that derives the summaries at the plan's level, in WBS order,
without sending `parentId`.

## References

- ADR-0051 §4; ADR-0163; ADR-0198.
- `apps/api/src/modules/share/guest-swimlanes.ts`, `share-guest.service.ts`, `dto/guest-dto.spec.ts`,
  `apps/api/test/share-guest-swimlanes.e2e-spec.ts`.
