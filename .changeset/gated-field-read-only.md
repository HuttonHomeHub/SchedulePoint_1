---
'@repo/web': minor
---

A gated form field is read-only, not disabled (ADR-0083). A field's loss on being disabled is not
operability but **readability** — the value leaves the tab order, cannot be copied, and was exempt
from the contrast floor — so "you may not edit this" was implemented as "you may not read it
either" at 39 call sites. Text and textarea take `readOnly`; a checkbox takes `aria-disabled` plus
a click guard; a native `<select>` keeps the attribute as a named exception; `Combobox` gains a
`readOnly` mode. The reason renders once per group and every field points at it.
