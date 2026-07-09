import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multi-line text primitive. Mirrors {@link Input}'s tokens; forwards its ref. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'border-input bg-background ring-offset-background flex min-h-16 w-full rounded-md border px-3 py-2 text-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive-text aria-[invalid=true]:focus-visible:ring-destructive-text',
        className,
      )}
      {...props}
    />
  );
});
