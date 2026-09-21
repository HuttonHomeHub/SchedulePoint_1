---
'@repo/web': patch
---

Rename the `Float & drift` canvas toggle to `Feasible window`, and key the legend once instead of twice.

The control describes the same overlay under a name that matches the picture it now draws. Its key
is unchanged, because renaming that would touch three consumers and the whole view-toggle contract
to say nothing new.

The legend's two keys become one. The old pair had to explain why the left-hand tail was usually
absent — drift is zero everywhere in Early mode by construction — and that apology disappears with
the shape rather than being rewritten: a bracket with no drift simply starts at the bar.
