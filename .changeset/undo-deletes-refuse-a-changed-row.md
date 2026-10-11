---
'@repo/web': patch
---

Undo and Redo no longer delete a row a colleague has just changed. When a step removes an activity, a link, an assignment or a summary's grouping, the delete now names the version it checked a moment earlier, so an edit that landed in between sets the step aside as "skipped" instead of being deleted along with the row. A "Level of effort" span whose redo failed part-way no longer leaves a stray activity behind when you try again. The revision comparison panel and its printout read the plan's placed or earliest dates under their new, basis-neutral names; nothing looks different.
