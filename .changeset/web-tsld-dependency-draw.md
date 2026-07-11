---
'@repo/web': minor
---

Add **dependency-draw** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags from an activity bar's
start/finish **edge handle** to another bar to create a logic link: a rubber-band follows the
pointer, the valid drop target is highlighted, and modifiers pick the type — plain drag is
**FS**, **Shift** is **SS**, **Alt** is **FF** (the rarer **SF** stays in the dependency
dialog). On drop the link is created via the existing `POST /dependencies` and the schedule
recalculates authoritatively. A cycle or duplicate (ADR-0021) is surfaced as a non-destructive
conflict banner with the engine's reason — nothing is created and the draw is never retried. The
capability is keyboard-reachable too: pressing **Enter** on a focused activity in the diagram's
listbox opens its logic editor, so link-draw adds no pointer-only capability (WCAG 2.1.1).
Editing remains off in the default build.
