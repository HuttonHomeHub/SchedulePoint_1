# M3 record: the health advisory and a tolerant import report (#384, #387)

What M3 of [the plan](./implementation-plan.md) built, and the runs that established it. Every
mutation below was applied to one file at a time from a copy, run, and restored from that copy.

## M3-T0: the offender disclosure and print section are extracted

`HealthOffenderDisclosure` and `HealthOffenderPrintSection` were extracted from the metric row and
the print table with no behaviour change. The `ScheduleHealthPanel` and `HealthPrintDocument` suites
passed unedited through the extraction (commit `0eb90b9d` touches neither), which is the
before/after oracle for a move. The lists gained explicit list roles, pinned by two new cases
verified red without them.

## M3-T1: the health report's `advisories`

The health report gains `advisories`, total over `HEALTH_ADVISORY_IDS = ['ZERO_DURATION_TASKS']`,
kept outside the fourteen metrics and never counted in `summary` (FC-4). The assignment loader
returns counts from the query it already made (FC-7), renamed from `loadHealthAssignedActivityIds`
to `loadHealthAssignmentCounts` because it now returns counts rather than presence.

| Mutation                                                             | Cases that went red           |
| -------------------------------------------------------------------- | ----------------------------- |
| `'LEADS'` (a metric id) added to `HEALTH_ADVISORY_IDS`               | G1/G2's new disjointness case |
| `healthAnnouncement()` no longer appends the advisory clause         | 3 announcement cases          |
| The singular branch of `zeroDurationPhrase` changed                  | the one-task case             |
| The zero branch of `zeroDurationPhrase` changed                      | the zero case                 |
| `healthAdvisoriesOf` reads `report.advisories` without the `?? null` | the older-API case (spec E32) |

## M3-T2: the panel section and the printed section

A "Beyond the DCMA assessment" section after the fourteen metrics, on screen and on paper, with its
footer sentence; an offender activates through the existing jump seam. Against an API that does not
send `advisories`, and against an empty array, no section renders.

| Mutation                                                         | Cases that went red                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The panel section removed                                        | 4 panel cases, and `e2e-health-check` ("Expected substring: 'Zero-duration tasks'") |
| `healthAdvisoriesOf` returns the field without the guard         | the 2 absent-field cases                                                            |
| `role="list"` dropped from each of the three print lists in turn | the print roles case, each time                                                     |

The print roles case first passed against its own mutation, because its fixture had no scope-note
row, so the third list never rendered. A `RESOURCES` narrowing row was added, and the mutation then
went red for all three lists.

`e2e-health-check` seeds one zero-duration task, `Handover sign-off`, and asserts the section, its
accessible description and footer, and that activating the offender selects it in the canvas
listbox.

## M3-T3: the import report is read tolerantly (closes #387)

`packages/interchange/src/report.ts` builds every report schema in one function over one field
list, in two modes: `strip` for readers (`interchangeReportSchema`) and `strict` for the producer's
own tests (`interchangeReportStrictSchema`). The commit envelope strips too.

`apps/web/src/features/interchange/api/report-tolerance.test.ts` drives the dry-run, the commit
envelope and the export header parse with a report carrying an unknown key at the top level, in
`mapped`, in a finding, in a collision and in its `existing` row. Run first against the `.strict()`
schema (the package `dist` from before the change): **3 of 4 red**, each with
`unrecognized_keys` at every one of the five levels. The fourth case, a known key with a wrong
value (`mapped.activities: -1`), is a control that must hold in both, and did.

`packages/interchange/src/report.spec.ts`:

| Mutation                                               | Case that went red                           |
| ------------------------------------------------------ | -------------------------------------------- |
| `counts` built with `z.strictObject` whatever the mode | the reader strips at every level             |
| `objectIn` ignores the mode and always strips          | the strict schema refuses at every level     |
| `activities: z.number().int()` (no `.min(0)`)          | the reader still refuses a negative count    |
| `lanes` declared in strip mode only                    | the two modes are built over the same fields |
| The commit envelope given `.strict()` back (web)       | the commit envelope case                     |

`canonical.spec.ts`'s "rejects an unknown finding kind" passed unedited.

## M3-T4: `advisories` on the import report, and the review's Advisories group

The schema gains `advisories?` over `IMPORT_ADVISORY_CODES = ['ZERO_DURATION_TASK']`, in both
modes. The review renders an "Advisories" group after the findings only when the report carries
some. Nothing produces the key yet (M5).

**FC-5 (a), the markup.** The report table and the collision list were rendered to HTML before the
change, from the same fixture, and again after it. With the added `role="list"` and
`role="listitem"` attributes removed, the two are identical. So a report without the key renders
exactly as it did before M3-T4, apart from the roles this same task adds. The committed case pins
the part that can be committed: a report without the key renders exactly as one with an empty array.

| Mutation                                                  | Cases that went red                                |
| --------------------------------------------------------- | -------------------------------------------------- |
| `advisories` removed from the schema                      | 3 of 3 advisory schema cases                       |
| The Advisories group not rendered                         | the dialog's group case                            |
| The group rendered always, with `report.advisories ?? []` | the FC-5 (a) case and the dialog's "no group" case |
| `role="list"` dropped from the finding list               | the finding list roles case                        |
| `role="listitem"` dropped from the collision list         | the collision list roles case                      |

## Deviation

`docs/API.md` was not told about the health report's `advisories` in M3-T1. It is documented in
M3-T4's commit, with the import report's tolerant reading rule and its optional `advisories`.
