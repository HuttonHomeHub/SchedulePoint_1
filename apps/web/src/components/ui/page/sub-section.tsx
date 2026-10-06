import { useHeadingLevel } from './heading-level';

import { cn } from '@/lib/utils';

export interface SubSectionProps {
  /** The sub-heading. */
  title: React.ReactNode;
  /** What the sub-section holds. Omitted, it is a heading alone — a caption for a block the caller lays out. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * A titled part of a section's body — the one sub-heading treatment.
 *
 * **It replaces six hand-rolled ones** (`<h3 className="text-sm font-medium">` and its cousins in
 * the diagnostics, probe and sitting panels), each its own size and weight, each an `h3` chosen by
 * its author. The rank here is read from `HeadingLevelContext`, which a `SectionCard` sets to its own
 * rank plus one for its body: a sub-section of an ungrouped card is an `h3`, of a card inside a
 * `SectionGroup` an `h4`, and neither is something a caller says.
 *
 * It is **not a landmark** and adds no wrapper roles — a `<div>` and a heading. A body that needs a
 * region of its own is a `SectionCard`.
 */
export function SubSection({ title, children, className }: SubSectionProps): React.ReactElement {
  const level = useHeadingLevel();
  const Heading = `h${level}` as const;
  return (
    <div className={cn('space-y-1', className)}>
      <Heading className="text-sm font-semibold wrap-anywhere">{title}</Heading>
      {children}
    </div>
  );
}
