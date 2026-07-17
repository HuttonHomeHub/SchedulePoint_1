---
'@repo/api': minor
'@repo/types': minor
---

**EV4a — conditional per-role cost reads (ADR-0042).** The money **amount** fields are readable again on
the general entity responses, but ONLY when the caller holds `cost:read` (Planner + Org Admin),
org-scoped — a Viewer/Contributor still NEVER sees cost. This supersedes the earlier EV2a "remove cost
from all reads" cut with the security reviewer's preferred conditional-field-inclusion, and unblocks the
EV4 web edit forms (which must read the current cost to prefill and not clobber it on save).

Re-exposed (as `number | null` on the wire; `null` = unset OR caller-not-permitted): resource
`costPerUnit`; assignment `budgetedCost` / `actualCost`; activity `budgetedExpense` / `actualExpense`.
The gate is threaded via a `canReadCost` boolean the service computes once from the already-resolved
organisation (`principal.can('cost:read', org.id)` — never `canAnywhere`, to avoid a cross-tenant IDOR)
and passes to each response DTO's `.from(entity, canReadCost)` mapper. Every read path that returns these
entities (resource get + list, activity get + list + plan-activities list, assignment list) gates
consistently and **fails closed** — a non-`cost:read` caller gets `null` for every cost field. The
`cost:read`-gated Earned-Value endpoint (EV2b) is unchanged. The `%`-complete / units / EAC / currency
fields are unaffected (they were never gated). No schema, engine, or write-DTO changes.
