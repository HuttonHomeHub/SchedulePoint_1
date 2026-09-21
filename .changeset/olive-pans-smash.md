---
'@repo/api': minor
---

Add the placement schema, dark: three placement columns and a snapshot level on the baseline tree,
`activities.remaining_float`, and the `placement_migrations` record.

Nothing reads or writes any of them yet — no DTO, no service, no engine input — so the API's
behaviour is unchanged and the ADR-0034 recalculation parity gate is untouched by construction.
The migrations ship ahead of their consumers deliberately, so a schema failure and a behaviour
failure land in separate releases (the ADR-0125 precedent).

`baselines.placement_snapshot_level` defaults to `NONE`, which is the literal truth of every
existing row: a baseline captured before this migration froze no placement, and `NONE` says
nobody looked rather than claiming there was nothing to look at (ADR-0126). None of the seven
new nullable columns takes a `DEFAULT`, for the same reason — a value that cannot be known for
a pre-existing row must not be fabricated for it.

Proved against a POPULATED database rather than a pristine one (ADR-0107): all three migrations
commit, no heap is rewritten, no existing value changes, and each assertion was made to fail
first. The committed `placement-schema.e2e-spec.ts` asserts only what `prisma:check-drift`
structurally cannot see — the absence of CHECK constraints — and carries its own negative
control.
