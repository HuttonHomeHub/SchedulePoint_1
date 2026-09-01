# The red run — the state this gate was written to find

`empty-state.structural.test.ts` landed with an **empty** allow-list and was run against the tree
at `016b6d68`. This is its output. The record exists because the red state disappears the moment
the allow-list is populated, and every later milestone only ever makes the list shorter — so
without this file, nothing would ever again show that the gate had something to find (ADR-0120's
precedent).

**34 occurrences across 29 files**, matching the count derived independently by `grep` before the
gate was written. The allow-list that follows has **32 entries**, not 34, and the difference is not
a discrepancy: two files (`ProjectCalendarsSection` and `EarnedValuePanel`) carry the _same class
string_ twice, and an entry keyed `file::substring` covers both. Keying by file alone was rejected
— three files hold two genuinely different strings, and a file-level exemption would hide the
second.

## What was verified, in all three directions

The gate is finished when it has been made to fail by the defect it names (ADR-0110 D5), so each
assertion was driven to red separately:

| Assertion                                    | Made to fail by                                      | Result                                          |
| -------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `appears only where it is allow-listed`      | the empty allow-list, against the real tree          | 34 findings                                     |
| the same, against a **new** site             | one hand-rolled class string added to `list-row.tsx` | named it                                        |
| `recognises the treatment it exists to find` | —                                                    | passes; it is the guard against a vacuous green |
| `has no stale allow-list entry`              | an entry for a file that does not offend             | named it                                        |

The second row is the one that matters most and is easy to skip: an allow-list matching the tree
exactly would satisfy the first assertion forever while protecting nothing. What the gate is _for_
is the 35th site.

## The findings

- `routes/audit-log.tsx :: border-border text-muted-foreground mt-6 rounded-lg border border-dash`
- `routes/client-detail.tsx :: border-border text-muted-foreground mt-4 rounded-lg border border-dash`
- `routes/plan-detail.tsx :: border-border text-muted-foreground mt-4 rounded-lg border border-dash`
- `routes/project-detail.tsx :: border-border text-muted-foreground mt-4 rounded-lg border border-dash`
- `components/layout/workspace/resource-strip-panel.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/activities/components/ActivitiesTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/activities/components/ActivityProgressPanels.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/audit/components/AuditEventList.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/audit/components/AuditEventList.tsx :: border-border rounded-lg border border-dashed p-8 text-center`
- `features/baselines/components/BaselinesPanel.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/calendars/components/CalendarExceptionsEditor.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/calendars/components/CalendarsTable.tsx :: border-border rounded-lg border border-dashed p-8 text-center`
- `features/calendars/components/CalendarsTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/calendars/components/ProjectCalendarsSection.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/calendars/components/ProjectCalendarsSection.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/clients/components/ClientsTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/cross-plan-dependencies/components/CrossPlanLinksSection.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/dependencies/components/AddLinkSection.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/dependencies/components/DependencyTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/earned-value/components/EarnedValuePanel.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/earned-value/components/EarnedValuePanel.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/interchange/components/ImportScheduleDialog.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/members/components/MembersTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/notes/components/NoteThread.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/plans/components/PlansTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/projects/components/ProjectsTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/recently-deleted/components/RecentlyDeletedTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/resources/components/ActivityResourcesPanel.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/resources/components/ResourceHistogram.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/resources/components/ResourcesTable.tsx :: border-border rounded-lg border border-dashed p-8 text-center`
- `features/resources/components/ResourcesTable.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/share/components/GuestPlanView.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/share/components/ShareLinksDialog.tsx :: border-border text-muted-foreground rounded-lg border border-dashed p-`
- `features/tsld/components/TsldPanel.tsx :: border-border text-muted-foreground flex items-center justify-center r`
