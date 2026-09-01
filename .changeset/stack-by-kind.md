---
'@repo/web': minor
---

Stack the resource histogram by **Kind** — `Labour` / `Equipment` / `Material` — on both the
dialog and the canvas strip. It needs nothing of the reader: no groups to have been built and no
filter per segment, so it is the one mode that says something about a programme nobody has
organised yet.

The `Stack by` picker no longer shuts entirely when the resource library holds no group. It shades
the `Group` option alone and says why in that option's label, so a library with no groups keeps
`Kind` — which is exactly the case it is most useful in.

The trailing context drawer is removed. Nothing has used it since the activity editor returned to a
dialog, and the shell keeps the same layout without it.
