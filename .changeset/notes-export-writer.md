---
'@repo/interchange': minor
---

An XER or MSPDI export now writes the plan's activity notes. An XER carries one P6 notebook memo per activity under a SchedulePoint topic, which a SchedulePoint import splits back into separate notes; an MSPDI carries one task note, with several joined by a rule. Only the text travels, never the author or date. A plan without notes exports exactly the file it did before. The export report counts the notes written and says in aggregate what was left out: plan notes, notes on WBS summaries in an XER, and notes over the ceiling.
