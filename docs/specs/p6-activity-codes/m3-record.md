# M3 record: what was built and measured

- **Spec:** [`./m3-spec.md`](./m3-spec.md) · **Plan:** [`./m3-plan.md`](./m3-plan.md) · **Design:**
  [`./m3-ui-design.md`](./m3-ui-design.md) · **Before this:** [`./m2-record.md`](./m2-record.md)

## 1. T0: the on-demand reads (2026-10-29, the builder)

**Status: built and tested; the owner ACCEPTED the measured miss of the `values=none` list on 2026-10-29**
(about 70 ms against its 60 ms slice, all of it the `valueCount` `groupBy` sequential scan) because the
Codes... first paint passes (121 to 136 ms against 200 ms). No index and no contract change (ADR-0142,
ADR-0076). The figures are under "The miss" below; T1 may bind. The machine ran about 1.4 times slower
than the M2 set, so on the M2 machine both parts would sit inside their slices.

### What was built

No schema change. `GET code-types?values=none` and `valueCount` (one `groupBy` over the page's type
ids), `GET code-types/:codeTypeId/values` (`limit` 1 to 1,000 default 1,000, UUID `cursor`,
`include=deleted` behind `code:restore`, `ORDER BY position, id`), `GET code-values?id=` (1 to 100
repeated ids, deleted values and values of deleted types named under `code:read`), `codes` on
`GET /organizations/:orgSlug/activities/:id`, a UUID `cursor` on both codes list routes, and the five
`CODE_*` limits in `@repo/types` (the API re-exports them).

### Measurement (ADR-0142)

`apps/api/test/measure/codes-reads.measure.ts`, extended: the 100 x 1,000 plan also holds 1,000 deleted
values on its first type and 100 deleted types. Same method as `m2-record.md` §9: local PostgreSQL 16.15
in the shared container (not the deployed host), warm, over HTTP through the real application, v4 ids,
`ITER` 30. Run with `RATE_LIMIT_LIMIT=100000` (the handler budget is 100 a minute and the harness fires
more than that at one handler). Three full runs, p95 in ms (p50 in brackets). **The machine is about 1.4
times slower than the M2 set**: the unchanged "list 100 activities, plan with no code type" read 52.6 to
61.0 ms p95 here against 39 ms in `m2-record.md` §9, so a ceiling set from M2's figures has less room
than it was written with.

| Case                                                                       | Ceiling (p95)    | Run 1       | Run 2       | Run 3       | Result                 |
| -------------------------------------------------------------------------- | ---------------- | ----------- | ----------- | ----------- | ---------------------- |
| `GET code-types?values=none` (100 types)                                   | <= 60 (the part) | 71.8 (50.5) | 76.2 (55.8) | 69.9 (51.8) | **miss**               |
| `GET code-types/:first/values` (1,000 values)                              | <= 140 (part)    | 48.9 (39.4) | 63.5 (48.8) | 59.8 (48.4) | pass                   |
| **Codes... first paint**: the two together                                 | **<= 200**       | 128.1       | 121.0       | 135.9       | pass                   |
| `GET code-types/:id/values?include=deleted`, 1,000 live + 1,000 deleted    | <= 200           | 56.2        | 55.6        | 62.9        | pass                   |
| `GET code-types?values=none&include=deleted`, 100 live + 100 deleted types | <= 60            | 67.1 (49.8) | 77.2 (53.4) | 71.8 (59.5) | **miss**               |
| `GET code-values?id=` x 100 ids across 100 types                           | <= 60            | 29.4        | 33.9        | 31.8        | pass                   |
| `GET activities/:id`, no-type plan                                         | (baseline)       | 24.3        | 24.5        | 26.3        |                        |
| `GET activities/:id`, 30-type coded plan, every type set                   | <= 15 added      | 23.6        | 27.6        | 23.6        | pass (0 to 3 ms added) |

For comparison, the default nested `GET code-types` at 100 x 1,000 read 3.1 s p95 in run 1 (2.6 s in
`m2-record.md` §9), so the first paint is about 25 times cheaper than the read it replaces.

### The miss

Two cases are over a stated ceiling: `values=none` on the 100-type plan (69.9 to 76.2 ms against 60), and
`values=none&include=deleted` (67.1 to 77.2 against 60). **Both are the `valueCount` `groupBy`, not the
types read.** `EXPLAIN (ANALYZE, BUFFERS)` of that statement on the same data, 100,000 live values:

```text
HashAggregate  (actual time=61.273..61.296 rows=100)
  -> Hash Join (actual time=1.042..42.415 rows=100000)
       -> Seq Scan on code_values (actual time=0.015..26.165 rows=101500)
            Filter: ((deleted_at IS NULL) AND (organization_id = $0))
       -> Hash on code_types (100 live types of the plan)
Execution Time: 61.455 ms
```

It reads the whole value table (a sequential scan on the table, 1,679 buffers) because no index serves
"live values of these types". The cost is linear in the plan's live values, which is why the 30 x 50
plan is not affected (1,500 rows). The combined first paint (121 to 136 ms) is inside its 200 ms ceiling;
the individual 60 ms slice is what is missed.

**Remedies considered, none taken; remedy 2 was chosen by the owner on 2026-10-29** (the plan: "a miss blocks T1 from binding and goes to backend-performance-reviewer
and the owner with the figure"; any index is a schema change and goes to the database-architect, CLAUDE.md
section 19.3):

1. **A partial index** on `code_values (code_type_id) WHERE deleted_at IS NULL`, which would let the count
   run as an index-only scan. Schema change: database-architect.
2. **Accept the slice**: the first paint is the number the owner fixed (<= 200 ms together), it passes in
   all three runs with 64 ms or more to spare, and the 60 ms part was a split of that figure, not a
   separate requirement. On a machine 1.4 times faster than this one both parts would be inside their
   slices.
3. **Drop `valueCount` from the list** and let the dialog count the values it has loaded. Changes the
   contract the design fixed (the left pane's "4 values" and the delete sentence need it before a type's
   values are loaded).
