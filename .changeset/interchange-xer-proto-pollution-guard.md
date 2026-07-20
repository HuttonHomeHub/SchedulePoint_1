---
'@repo/interchange': patch
---

Harden the XER parser against prototype pollution / remote property injection. A `%F` field list is
attacker-controlled, so a crafted `.xer` could declare a column literally named `__proto__`,
`constructor` or `prototype` and — when used as a dynamic object key — pollute `Object.prototype`.
Parsed rows are now a `Map<string, string>` rather than a plain object (`XerTable.rows` is
`ReadonlyArray<ReadonlyMap<string, string>>`, read via `row.get(name)`), so an arbitrary file-supplied
column name can never be written as an object property. Real imports are unaffected. Fixes two CodeQL
`js/remote-property-injection` (high) findings.
