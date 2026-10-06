/**
 * The page archetypes (ADR-0097 Landing A).
 *
 * **Eight** components that between them decide, once, what every screen's frame, heading,
 * section, empty state, loading shape, row, page grid and metric block look like — decisions that
 * were previously made 14 and 16 times by hand. Landing B's condition is that the organisation
 * landing page is built FROM these rather than from a bespoke layout that happens to look right; a
 * missing archetype discovered while building it is the failure that condition exists to prevent.
 *
 * This sentence said "Six" until 2026-09-16, over a barrel exporting eight: ADR-0143 added
 * `PageGrid` and `StatGrid` directly below it and did not update the line above them. A count in
 * the file a reader opens to learn what the archetypes ARE is the worst place for one to go stale,
 * and it is the drift class this repository builds gates for — so it is corrected here rather than
 * filed. It is **nine** since 2026-09-17 (`ChildCounts`), **ten** since the staff console
 * redesign's M0 moved `StatusSection` here from `features/staff`, **eleven** with its
 * `QueryPanel`, and **fourteen** since that redesign's M2 added `SectionGroup`, `SubSection` and
 * `KeyValueList` (ADR-0178); adding a fifteenth means editing this line.
 */
export { PageContainer, type PageContainerProps } from './page-container';
export { PageHeader, type PageHeaderProps } from './page-header';
export { SectionCard, type SectionCardProps } from './section-card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { Skeleton } from './skeleton';
export {
  ListRow,
  ListRowSkeleton,
  RowSubject,
  rowLinkClass,
  type ListRowProps,
  type RowSubjectProps,
} from './list-row';
export { PageGrid, PageGridItem, type PageGridProps, type PageGridItemProps } from './page-grid';
export { StatGrid, type StatGridProps, type StatItem, type StatTone } from './stat-grid';
export { StatusSection, type StatusSectionProps } from './status-section';
export { QueryPanel, type QueryPanelProps } from './query-panel';
export { SectionGroup, type SectionGroupProps } from './section-group';
export { SubSection, type SubSectionProps } from './sub-section';
export { KeyValueList, type KeyValueItem, type KeyValueListProps } from './key-value-list';
export { ChildCounts, type ChildCount, type ChildCountsProps } from './child-counts';
