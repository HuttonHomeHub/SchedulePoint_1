---
'@repo/web': minor
---

Extract two shared primitives from the canvas authoring surface, and honour either arrow key on the
Add and Link split buttons (TECH_DEBT #76).

Four hand-rolled "message + optional action" strips become one `NoticeStrip`; the duplicated
split-button composite becomes one `ToolbarSplitButton` that guarantees the two facts each copy had
been asked to remember — the pair is a single keyboard stop, and focus returns to the half that is
in the tab order. Both `ArrowDown` and `ArrowUp` now open the type menus, matching the toolbar's
other menu control. A new end-to-end case releases the plan's edit lock with a link pick open and
proves the link is refused rather than silently recorded.
