---
'@repo/interchange': minor
'@repo/api': minor
---

Import: repair duplicate activity **names**, not just codes.

An activity's name is unique per plan, but the interchange validate/repair step only
de-duplicated codes — so a file with repeated names passed the whole pipeline reporting zero
repairs and then failed on the unique index inside the commit, rolling the entire import back.
That is the normal shape of a real P6 export, which makes the code unique and repeats names per
zone and per level. Later duplicates are now suffixed and reported like every other repair, and
both the code and name repairs honour their field's length ceiling.

The generic conflict message no longer says "A resource with these details already exists" — it
meant a REST resource, but this product has a resource library, so the message sent readers to a
panel with nothing in it.
