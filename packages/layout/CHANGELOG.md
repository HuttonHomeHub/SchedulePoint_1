# @repo/layout

## 0.1.0

### Minor Changes

- [#683](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/683) [`da523b2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/da523b2331351c0a04f0de305d3485627c371f2d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - An imported schedule now opens with no bar overlapping another in its row, and the same file lays out the same way every time. The importer arranged rows by each activity's earliest dates while the diagram draws where each bar actually sits, and it broke ties by chance, so a large P6 file could open with dozens of bars on top of each other, differently on every import.
