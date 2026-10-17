import { Loader2 } from 'lucide-react';

import { useLateStatus } from '@/hooks/use-late-status';
import { cn } from '@/lib/utils';

/**
 * Accessible loading indicator for a GATE (the answer decides which layout renders) or an ACTION /
 * COMPUTATION (a result the reader is waiting on). A surface whose settled shape is known gets a
 * skeleton instead — `LoadingShape` (the discriminator is in `docs/specs/loading-skeletons/`;
 * `loading-states.structural.test.ts` refuses a new spinner until someone declares which of the two
 * it is).
 *
 * **`label` is required and the primitive carries no default copy.** The default it used to have
 * ("Loading…") was announced beside a visible sentence that said something more specific, because a
 * caller who passed `aria-hidden` to the icon had it silently dropped (hyphenated JSX attributes are
 * not type-checked). `labelOnScreen` is the supported way to put the sentence on screen: the visible
 * text and the announcement are then ONE element, so they cannot disagree.
 *
 * The status mounts with its sentence absent and receives it after mount (`useLateStatus`): a live
 * region inserted already holding its text is commonly not announced.
 */
export function Spinner({
  className,
  label,
  labelOnScreen = false,
}: {
  className?: string;
  /** One sentence naming what is happening: "Calculating float paths…". */
  label: string;
  /** Render the sentence beside the icon, instead of for assistive technology alone. */
  labelOnScreen?: boolean;
}): React.ReactElement {
  const text = useLateStatus<HTMLSpanElement>(label);
  return (
    <span role="status" className={cn('inline-flex items-center', labelOnScreen && 'gap-2')}>
      <Loader2
        className={cn('text-muted-foreground size-5 animate-spin', className)}
        aria-hidden="true"
      />
      <span ref={text} className={labelOnScreen ? 'text-muted-foreground text-sm' : 'sr-only'} />
    </span>
  );
}
