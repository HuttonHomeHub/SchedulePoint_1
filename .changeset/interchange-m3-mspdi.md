---
'@repo/interchange': minor
---

Add Microsoft Project **MSPDI (`.xml`) import** (ADR-0050, Stage C2 M3 — pure package). A second parser

- adapter (`mspdi-parser`, `mspdi-calendar`, `mspdi-adapter`, `importMspdi`) feed the **same**
  format-agnostic canonical model the XER path produces, so the mapper, validate/repair/report, graph-size
  ceilings and report shape are reused unchanged — MSPDI is a parser, not a second pipeline. Maps the MS
  Project vocabulary: `<Task>` (incl. `<Summary>`→`WBS_SUMMARY` + outline-level parentage, `<Milestone>`,
  `PT#H#M#S` durations, `<ConstraintType>` 0–7, `<PercentComplete>`/actuals/remaining), nested
  `<PredecessorLink>` (link types 0–3, tenths-of-a-minute lag), `<Calendar>` week-days + exceptions,
  `<Resource>` (types 0–2) and `<Assignment>`. Parsing uses `fast-xml-parser` configured for untrusted
  input — `processEntities: false` (no entity expansion → no billion-laughs / XXE), external entities
  inert, plus byte + node-count caps — with typed, user-safe rejections. `.mpp` (proprietary binary) is
  rejected with a guiding message to export MSPDI XML instead. The CPM engine + recalc parity golden suite
  are untouched. API routing + web `.xml` acceptance land separately.
