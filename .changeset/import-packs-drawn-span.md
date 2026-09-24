---
'@repo/api': patch
'@repo/web': patch
'@repo/layout': minor
---

An imported schedule now opens with no bar overlapping another in its row, and the same file lays out the same way every time. The importer arranged rows by each activity's earliest dates while the diagram draws where each bar actually sits, and it broke ties by chance, so a large P6 file could open with dozens of bars on top of each other, differently on every import.
