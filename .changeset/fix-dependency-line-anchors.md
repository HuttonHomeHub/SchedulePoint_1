---
'@repo/web': patch
---

fix(web): anchor TSLD dependency lines to the correct edges per relationship type

Dependency lines on the canvas were always drawn predecessor-finish → successor-start (FS geometry),
ignoring the tie's actual type. They now attach to the edges the relationship constrains: **FS**
finish→start, **SS** start→start, **FF** finish→finish, **SF** start→finish. The orthogonal elbow for
cross-lane links is routed clear of the anchored edges (outside a finish edge, outside a start edge,
or split for SF) so the line no longer cuts back across a bar. Pure render-model change; the engine
already scheduled every type correctly — only the drawn line was wrong.
