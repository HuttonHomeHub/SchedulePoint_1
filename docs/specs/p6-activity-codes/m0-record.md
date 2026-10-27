# M0 record: what is known about P6's classification-code tables

- **Spec:** [`./spec.md`](./spec.md) §3 · **Plan:** [`./plan.md`](./plan.md) M0
- **Status:** M0-T1 (public sources) done 2026-10-27. **M0-T2 (a real export) is open** and is what
  M5 and M6 wait for.
- **Vocabulary:** these tables are P6's "activity codes"; in SchedulePoint's own words they are code
  types, code values and assignments (spec §0).

## How this was established

The four pages the plan names were fetched on 2026-10-27 and the column names read off the page text
(`curl -L <url>`, tags stripped, searched for `actv`/`TASKACTV`). Nothing here comes from a P6 file
this repository holds: a search of the tree for `ACTVTYPE` and `TASKACTV` finds only this feature's own
code and documents, and the P6-class conformance fixture
(`packages/engine-conformance/fixtures/p6_torture_test_v1.xer`) carries `PROJECT`, `CALENDAR`,
`PROJWBS`, `TASK`, `TASKPRED`, `RSRC` and `TASKRSRC` and none of the three code tables.

Sources: **A** [planningplanet.com/comment/30832](https://planningplanet.com/comment/30832) ·
**B** [the back-end thread](https://www.planningplanet.com/forums/oracle-primavera-pm6/603778/questions-about-back-end) ·
**C** [planningplanet.com/comment/96953](https://planningplanet.com/comment/96953) ·
**D** [planningplanet.com/index.php/comment/88966](https://planningplanet.com/index.php/comment/88966).

## The rule applied

The plan's risk for M0-T1 is a forum post being wrong, so **a column is marked confirmed only when two
sources name it**. Only source A prints `%F` lines; B, C and D name tables and a few columns. By that
rule far fewer columns are confirmed than spec §3's table says, and this record is the stricter one.
Where it differs from the spec the spec's table is not edited here (the spec is the approved document);
M1 is built to the strict reading, so nothing depends on the difference.

## Tables

| Table      | Sources | Status    |
| ---------- | ------- | --------- |
| `ACTVTYPE` | A, B, C | confirmed |
| `ACTVCODE` | A, B, C | confirmed |
| `TASKACTV` | A, B    | confirmed |

B gives the chain `ACTVTYPE → ACTVCODE → TASKACTV`.

## Columns

| Table      | Column                 | Sources | Status                                                                |
| ---------- | ---------------------- | ------- | --------------------------------------------------------------------- |
| `ACTVTYPE` | `actv_code_type_id`    | A, D    | confirmed                                                             |
| `ACTVTYPE` | `actv_code_type_scope` | A, C    | confirmed; values `AS_EPS`, `AS_GLOBAL`, `AS_PROJECT` named by C only |
| `ACTVTYPE` | `actv_code_type`       | A       | single source (a verbatim `%F` line); read by M1, degrades to the id  |
| `ACTVTYPE` | `proj_id`              | A       | single source; read by M1, a missing column counts as this project    |
| `ACTVTYPE` | `actv_short_len`       | A       | single source; not read                                               |
| `ACTVTYPE` | `seq_num`              | A       | single source; not read                                               |
| `ACTVTYPE` | `wbs_id`               | A       | single source; not read                                               |
| `TASKACTV` | `task_id`              | A       | single source; not read by M1                                         |
| `TASKACTV` | `actv_code_type_id`    | A       | single source; read by M1 to name the types in use                    |
| `TASKACTV` | `actv_code_id`         | A       | single source; not read by M1                                         |
| `TASKACTV` | `proj_id`              | A       | single source; read by M1 to leave other projects' rows out           |
| `ACTVCODE` | `actv_code_id`         | A       | single source; **unconfirmed, not read**                              |
| `ACTVCODE` | `parent_actv_code_id`  | A       | single source; **unconfirmed, not read** (sets whether values nest)   |
| `ACTVCODE` | `actv_code_type_id`    | A       | single source; **unconfirmed, not read**                              |
| `ACTVCODE` | `actv_code_name`       | A       | single source; **unconfirmed, not read** (the description)            |
| `ACTVCODE` | `short_name`           | A       | single source; **unconfirmed, not read** (the short code)             |
| `ACTVCODE` | `seq_num`              | A       | single source; **unconfirmed, not read**                              |

Source A's three `%F` lines, as printed there (field order only; they are one person's export, not a
sample this repository keeps):

- `ACTVTYPE`: `actv_code_type_id`, `actv_short_len`, `seq_num`, `actv_code_type`, `proj_id`, `wbs_id`,
  `actv_code_type_scope`
- `ACTVCODE`: `actv_code_id`, `parent_actv_code_id`, `actv_code_type_id`, `actv_code_name`, `short_name`,
  `seq_num`
- `TASKACTV`: `task_id`, `actv_code_type_id`, `actv_code_id`, `proj_id`

M5 and M6 do not start from A alone: a second source, or a real export (M0-T2), has to agree first.

## Still unknown, and owed by M0-T2

None of these can be read from a public page; each stays unconfirmed until a real export is read.

- The longest short code and description seen, and P6's documented maxima (they set migration B's two
  CHECK bounds, design §5.3).
- Whether `ACTVCODE` has a parent column (A prints one; one source) and so whether
  `code_values.parent_id` exists.
- Whether real files carry case-distinct short codes (`l1`/`L1`).
- Whether an activity can carry two values of one type (no source states it).
- The P6 version, counts and the verbatim `%T`/`%F` lines of all three tables.
- One discrepancy to resolve: spec §3 spells the scope values `AS_Global`/`AS_EPS`/`AS_Project`; source C
  writes `AS_GLOBAL`/`AS_PROJECT`. M1 does not read the scope, so nothing is affected yet.

## What M1 built from this

The made-up test file for the report (`packages/interchange/src/import-xer.spec.ts`,
`apps/web/e2e-interchange/support.ts`, `apps/api/test/interchange.e2e-spec.ts`) uses `ACTVTYPE` with
`actv_code_type_id`, `actv_code_type`, `proj_id`, `actv_code_type_scope` and `TASKACTV` with `task_id`,
`actv_code_type_id`, `actv_code_id`, `proj_id`. It has no `ACTVCODE` table and was not copied from any
P6 file.
