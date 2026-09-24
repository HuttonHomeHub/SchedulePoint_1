# @repo/layout

## 0.2.0

### Minor Changes

- [#685](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/685) [`a6c8f3f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a6c8f3fd22e19c39839ba45e250ca6da84f6613d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Importing a SchedulePoint XER now restores its layout: each activity's hand-placed start and lane, read from two user-defined fields only SchedulePoint writes. Lanes the file carried stay where they were, and activities without one are placed around them. The import dialog shows how many placed starts and lanes it will restore, and offers **Restore the SchedulePoint layout** so a planner can switch it off. The report names placements the logic no longer allows and carried lanes whose bars overlap. A file from another tool imports exactly as before, apart from one new finding counting any user-defined fields it carried that were not imported.
  
  Export does not write these fields yet; that ships in the next release, so this reader is already deployed when the first layout-carrying file exists. A browser tab still running an older SchedulePoint cannot read the two new report counts, which is why the reader ships first.

## 0.1.0

### Minor Changes

- [#683](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/683) [`da523b2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/da523b2331351c0a04f0de305d3485627c371f2d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - An imported schedule now opens with no bar overlapping another in its row, and the same file lays out the same way every time. The importer arranged rows by each activity's earliest dates while the diagram draws where each bar actually sits, and it broke ties by chance, so a large P6 file could open with dozens of bars on top of each other, differently on every import.
