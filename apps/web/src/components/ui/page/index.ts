/**
 * The page archetypes (ADR-0097 Landing A).
 *
 * Six components that between them decide, once, what every screen's frame, heading, section,
 * empty state, loading shape and row look like — decisions that were previously made 14 and 16
 * times by hand. Landing B's condition is that the organisation landing page is built FROM these
 * rather than from a bespoke layout that happens to look right; a missing archetype discovered
 * while building it is the failure that condition exists to prevent.
 */
export { PageContainer, type PageContainerProps } from './page-container';
export { PageHeader, type PageHeaderProps } from './page-header';
export { SectionCard, type SectionCardProps } from './section-card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { Skeleton } from './skeleton';
export { ListRow, ListRowSkeleton, type ListRowProps } from './list-row';
