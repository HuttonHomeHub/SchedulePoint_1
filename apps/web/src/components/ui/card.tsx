import { cn } from '@/lib/utils';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** Surface container. Composes with the header/title/content/footer parts. */
export function Card({ className, ...props }: DivProps): React.ReactElement {
  return (
    <div
      className={cn(
        'border-border bg-card text-card-foreground rounded-lg border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- content is supplied by consumers via children
    <h1
      className={cn('text-xl leading-tight font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps): React.ReactElement {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
