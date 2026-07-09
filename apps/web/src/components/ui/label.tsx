import { cn } from '@/lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/** Form label primitive. Always associate with a control via `htmlFor`. */
export function Label({ className, ...props }: LabelProps): React.ReactElement {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- primitive; consumers associate via htmlFor
    <label
      className={cn(
        'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}
