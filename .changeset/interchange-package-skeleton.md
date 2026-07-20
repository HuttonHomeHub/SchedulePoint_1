---
'@repo/interchange': minor
---

Introduce the pure, engine-free `@repo/interchange` package (ADR-0050): the format-agnostic canonical
schedule-interchange model (project / activity / relationship / calendar, M1 network scope) and the
`InterchangeReport` shape, with shared Zod schemas. This is the parse → canonical → map →
validate/repair/report substrate for XER / MS Project import; the XER parser, mapper, API module and
review UI land in later M1 tasks. No user-facing surface yet (behind `VITE_SCHEDULE_INTERCHANGE`); the
CPM engine and its recalc parity golden suite are untouched.
