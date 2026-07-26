import { cn } from '@/lib/utils';

/**
 * The product's **brand mark**: a rounded-square tile carrying the initial, beside the
 * "SchedulePoint" wordmark.
 *
 * The tile is `bg-primary text-primary-foreground` — deliberately a token, never a literal.
 * Inside the chrome scope that resolves to Corporate's amber on navy and to the brand blue on
 * Light/Dark chrome; a hard-coded amber would fail contrast the moment the header is white, and
 * would be exactly the one-off styling the design system forbids.
 *
 * Layout tier rather than a `ui/` primitive: it carries product copy, so it is not reusable
 * outside this product (`COMPONENT_LIBRARY.md` tier rules).
 */
export function BrandMark({ className }: { className?: string }): React.ReactElement {
  return (
    <span className={cn('flex shrink-0 items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold"
      >
        S
      </span>
      <span className="font-semibold tracking-tight">SchedulePoint</span>
    </span>
  );
}
