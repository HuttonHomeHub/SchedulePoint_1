---
'@repo/interchange': patch
---

Harden the XER parser against prototype pollution (remote property injection). A `%F` field list is
attacker-controlled, so a crafted `.xer` could declare a column literally named `__proto__`,
`constructor` or `prototype` and pollute `Object.prototype` via the keyed row write. Those field
names are now guarded (dropped, never used as a dynamic key) and row records are built on a
null-prototype object. None is a legitimate P6 schema column, so real imports are unaffected.
Fixes two CodeQL `js/remote-property-injection` (high) findings.
