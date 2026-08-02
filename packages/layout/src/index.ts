/**
 * `@repo/layout` — the pure lane-layout substrate (ADR-0019 build contract).
 *
 * It exists because **two callers need the same answer**: the TSLD canvas's Auto-arrange, which
 * re-flows a planner's diagram on demand, and the interchange importer, which has to decide what
 * lane every activity of a freshly-imported programme lands in. Before this package the importer
 * had no packer at all and gave each activity its own lane by source order, so a 500-activity file
 * opened as 500 lanes holding one bar each — a picture of nothing, on the one screen that forms a
 * planner's first impression of their own schedule.
 *
 * A second packer was never an option. Two implementations would agree on the day they were written
 * and drift after that, and the drift would be invisible: each diagram looks plausible alone, and
 * only someone comparing an imported plan against the same plan after pressing Auto-arrange would
 * ever see them disagree. That is the ADR-0065 `routeOrthogonal` rule applied one layer up.
 */
export { packLanes, type LaneChange, type PackItem } from './pack-lanes.js';
