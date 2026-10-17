import { useLateStatus } from '@/hooks/use-late-status';
import { cn } from '@/lib/utils';

export interface LoadingShapeProps {
  /** One sentence naming what is loading: "Loading notes…". Required — no default copy. */
  label: string;
  /**
   * Who speaks it. `'polite'` (default): a `role="status"` mounted EMPTY and filled after mount,
   * placed OUTSIDE any `aria-busy` subtree. `'none'`: the sentence is present as plain screen-reader
   * text, not live, because an enclosing region already speaks (`QueryPanel`'s `StatusSection`,
   * `RoutePending`, a sibling table's own shape).
   */
  announce?: 'polite' | 'none';
  className?: string;
  /** The shape. Rendered inside an `aria-hidden` wrapper; must contain nothing focusable. */
  children: React.ReactNode;
}

/**
 * The accessibility contract of a pending surface: **one sentence, or none where an enclosing
 * region already speaks** (`docs/specs/loading-skeletons/spec.md` §4.7).
 *
 * - The material (`children`) is `aria-hidden` and holds nothing focusable — breadcrumbs, actions
 *   and pickers appear as blocks, never as live controls.
 * - The status is never inside an `aria-busy` subtree. ARIA 1.2 lets assistive technology defer
 *   changes inside a busy element until it is no longer busy, by which time a loading sentence has
 *   unmounted; this is built so no reading of the specification can defer it. For the same reason
 *   this component does **not** set `aria-busy` on itself: `aria-busy` belongs on the element that
 *   persists from pending to settled and receives the content, and each site sets it there.
 * - It is self-contained rather than built on the shell's `useAnnounce`, because the guest view, the
 *   staff gate and the route-pending screen have no shell announcer to call.
 *
 * `data-loading-shape` is the hook measuring instruments use to know they are looking at a skeleton.
 *
 * @example
 * <LoadingShape label="Loading notes…">
 *   <Skeleton className="h-4 w-48" />
 * </LoadingShape>
 */
export function LoadingShape({
  label,
  announce = 'polite',
  className,
  children,
}: LoadingShapeProps): React.ReactElement {
  return (
    <div data-loading-shape="" className={cn(className)}>
      {announce === 'polite' ? (
        <LateStatus label={label} />
      ) : (
        <span className="sr-only">{label}</span>
      )}
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function LateStatus({ label }: { label: string }): React.ReactElement {
  const ref = useLateStatus<HTMLSpanElement>(label);
  return <span ref={ref} role="status" className="sr-only" />;
}
