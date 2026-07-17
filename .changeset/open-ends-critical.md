---
'@repo/api': minor
'@repo/types': minor
---

Make-open-ends-critical option (M6-F4, ADR-0035 §20). A new plan flag `makeOpenEndsCritical` (default
off) flags every open-ended activity — one with no predecessors or no successors — as critical, OR-ed
with the active critical definition so it only ever adds open ends, never a mid-chain member. It is
threaded through recalculation, echoed on the plan response, and accepted on plan update. Default off
is behaviour-preserving (existing critical sets unchanged). Conformance scenario **S08** now runs as a
criticality-only differential.
