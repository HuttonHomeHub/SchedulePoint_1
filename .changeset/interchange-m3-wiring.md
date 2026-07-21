---
'@repo/interchange': minor
'@repo/api': minor
'@repo/web': minor
---

Wire Microsoft Project MSPDI import through the stack (ADR-0050, Stage C2 M3). A new format-agnostic
`importSchedule` entry point in `@repo/interchange` detects the interchange format (Primavera P6 XER vs
MS Project MSPDI XML) from the bytes and routes to the matching orchestrator — both produce the same
import graph + report, so callers stay format-blind. The interchange commit/dry-run endpoints now call
`importSchedule` instead of the XER-specific path, so an uploaded `.xml` MSPDI file imports through the
exact same review→commit pipeline as `.xer` (an unrecognised file gets a single user-safe rejection). The
web **Import from file…** dialog accepts `.xer` **or** `.xml`, with updated copy and the unparseable-file
message naming both formats. On by default under the existing `VITE_SCHEDULE_INTERCHANGE` flag.
