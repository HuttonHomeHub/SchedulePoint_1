---
'@repo/web': minor
---

Add the baselines panel to the plan view (M7 Task D1, ADR-0025). A new
`features/baselines` surfaces a plan's baselines under the Schedule section: name, an
**Active** badge, when captured, the captured project finish, and the frozen activity
count. Planners/Org Admins get **Capture baseline** (a dialog that freezes the plan's
current computed schedule; a duplicate name or a never-calculated plan surface as
friendly inline messages with a "recalculate first" hint), plus per-row **Activate**
(exactly one active — activating one deactivates the rest server-side) and **Delete**
(with a warning when removing the active baseline). Everyone else reads. The shared API
client gains `apiFetchEnvelope` so the variance read can access the `{ data, meta }`
roll-up; the `baselineKeys` query keys and hooks (list/detail/variance/capture/activate/
delete) land here too. Empty/loading/error states and delete confirmation reuse the
shared DataTable/ConfirmDialog primitives.
