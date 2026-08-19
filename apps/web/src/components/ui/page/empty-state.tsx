import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** A Lucide icon element, or nothing. A section-sized empty state usually wants none. */
  icon?: React.ReactNode;
  /** What is not here — stated as a fact about this screen, never as an apology. */
  title: React.ReactNode;
  /** What the reader can do about it, or why they cannot. */
  description?: React.ReactNode;
  /**
   * The action that resolves the emptiness. **Optional, and its absence is a real case rather than
   * a degenerate one** — see the docblock.
   */
  action?: React.ReactNode;
  /**
   * `page` fills a screen that has nothing on it at all; `section` sits inside a `SectionCard`
   * whose siblings do have content. They are different sizes because they are answering different
   * questions: "this organisation is new" and "this one section is empty".
   */
  size?: 'page' | 'section';
  className?: string;
}

/**
 * What a screen or a section says when it holds nothing.
 *
 * **Two axes, not one, and the second was a finding rather than a design flourish.** The plan
 * specified "an icon, a one-line explanation and one action". Checking that against the
 * organisation landing page — the screen this archetype exists to build — found **five** empty
 * states of **two sizes** and **three shapes**, of which that description covers exactly one:
 *
 * - **Page-sized, with an action.** A brand-new organisation: "Add your first client".
 * - **Section-sized, with an action.** One section empty while its neighbours are not.
 * - **Section-sized, with no action at all.** A Viewer sees that nothing needs their attention and
 *   is told to ask a Planner — because they genuinely cannot act, and offering a button that
 *   refuses them is worse than offering none. This is the case a required `action` prop would have
 *   forced into a lie.
 *
 * There is a fourth thing that is NOT an empty state and must not render as one: a settled
 * one-liner like "Nothing needs you right now" is a **fact**, not an absence to be resolved. It is
 * a sentence, and giving it an icon and a frame would dress a good outcome as a problem.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'page',
  className,
}: EmptyStateProps): React.ReactElement {
  const isPage = size === 'page';
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        isPage ? 'gap-3 px-6 py-16' : 'gap-2 px-4 py-10',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            'text-muted-foreground bg-muted flex items-center justify-center rounded-full',
            isPage ? 'size-12' : 'size-9',
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className={cn('font-medium', isPage ? 'text-base' : 'text-sm')}>{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
      ) : null}
      {action ? <div className={cn(isPage ? 'mt-2' : 'mt-1')}>{action}</div> : null}
    </div>
  );
}
