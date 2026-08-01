---
'@repo/api': minor
'@repo/web': patch
---

Imported programmes now open laid out, instead of one activity per lane (ADR-0069).

An import gave each activity a lane matching its position in the source file, so a 500-activity XER
opened as 500 lanes holding one bar each — nothing wrong with the data, but the first diagram a
planner sees of a schedule they have just brought over from P6 was unreadable. The commit now packs
lanes after recalculating, using the same packer the canvas's Auto-arrange has always used, which is
extracted to a shared package so the two cannot drift apart. A layout failure leaves the imported
plan in place rather than discarding it.
