# M6 — the empty columns

**Status:** Accepted

Two columns that printed nothing, and one of them was not the defect it was filed as.

## T1 — the audit log's `Outcome` column

Folded into the Event row. The column's every cell was empty on a healthy installation: `SUCCESS`
is the overwhelming majority, so saying "Succeeded" on every row would drown the two outcomes worth
noticing, and the cell rendered `sr-only` instead. What a reader saw was a header with nothing under
it, beside a filter offering to narrow by it — which is how the product owner read it, and they were
right.

The `sr-only` success is **preserved**, and that is the part that earns a test. Deleting it would be
a silent WCAG regression: a screen-reader user would hear an event with no outcome at all and could
not tell a success from a row whose outcome nobody rendered. Non-success stays text and not colour
alone (WCAG 1.4.1), which is what the cell already did.

Four unit cases in `AuditEventList.test.tsx`; two verified red against named mutations:

| Assertion                                   | Mutation it was made to fail against             | Result       |
| ------------------------------------------- | ------------------------------------------------ | ------------ |
| success announces as "Succeeded", `sr-only` | replace the span with `null`                     | red, 1 of 10 |
| no `Outcome` column header                  | re-add `{ header: 'Outcome', cell: () => null }` | red, 1 of 10 |

## T2 — re-scoped, because M0 disproved its premise

The plan filed this as a clipped control: `Restore ddde first…` on the Recently deleted screen, with
the trailing ellipsis read as truncation. **M0 established the control is not clipped at any measured
width — the `…` is literal text in the source** (`RecentlyDeletedTable.tsx`). So no CSS remedy was
owed, and building one would have changed a correct layout.

What is wrong is the copy, and it is a real defect: the variable part sits in the **middle** of the
sentence, so `Restore ddde first…` reads as a sentence cut off rather than as a label with the
conventional "this opens a dialog" suffix. A blocker is a fact about the row, and D4 already decided
where a fact about a row goes — under it. So:

- the blocker is named under the row's own name: `Blocked by a deleted project, "Riverside"`;
- the action's visible label becomes bounded — `Restore project first…` — with the blocker's name in
  the accessible name, the visible label contiguous at the start of it (WCAG 2.5.3 requires the name
  to contain the label, not to reorder it);
- the mid-refetch fallback sentence says the kind rather than repeating the name;
- the Actions column declares `width: 'fit'`, which it could not honestly do before: a long client
  name in a `whitespace-nowrap` cell used to widen the whole column and take that width off the names
  beside it.

The invariant ADR-0096 established — **name the blocker, do not state the rule** — is unchanged, and
its test is unchanged in subject: it now asserts the blocker's name in the place the name moved to.

## The instrument was wrong before the product was

The journey assertion (`no column header stands over an empty column`) **passed against the very
column it was written to catch**, twice, and was only caught by dumping what it had scanned.

`DataTable` renders a **separate loading `<thead>`** whose cells print the header only for an
`srHeader` column (`data-table.tsx:236-239`), and its skeleton is three visible `<tr>`s. So
`getByRole('row').nth(1)` is visible the instant the route mounts, and a scan taken there finds
**zero visible headers**, examines nothing, and reports `[]` — a green run meaning "I looked at
nothing", not "everything is fine". This is ADR-0093's shape: a suite that cannot distinguish "all
classified" from "found none".

Two changes, and the second is the one that matters:

1. wait for a real cell (`Organisation created`) rather than for a row — this makes it rare;
2. a **pinned control** returning `examined` and `bodyRows`, asserted non-vacuous before the scan is
   believed — this makes it impossible.

Re-verified red with the control in place (one failure naming `Outcome`), then green.

One further fault, found by the first run: the route is `/orgs/:slug/audit-log`, not `/orgs/:slug/audit`.
That one failed loudly and cost a minute, which is the difference between a wrong assertion and a
vacuous one.
