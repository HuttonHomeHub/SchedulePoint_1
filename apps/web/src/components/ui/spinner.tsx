import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Accessible loading indicator. Announces itself to assistive tech via
 * `role="status"` and a visually-hidden label.
 */
export function Spinner({
  className,
  label = 'Loading…',
}: {
  className?: string;
  label?: string;
}): React.ReactElement {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2
        className={cn('text-muted-foreground size-5 animate-spin', className)}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
