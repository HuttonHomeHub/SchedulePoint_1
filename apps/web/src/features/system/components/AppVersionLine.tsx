import { APP_VERSION } from '@/config/env';
import { useApiVersion } from '@/features/system/api/use-api-version';
import { cn } from '@/lib/utils';

/**
 * A subtle, muted one-line display of both service versions (`web X · api Y`), for a
 * quiet corner of the app shell. Purely informational: while the API version is loading
 * (or if the read fails) the API half shows an ellipsis and only the web version is
 * certain. Legible to assistive tech (a plain, labelled line — never `aria-hidden`), and
 * deliberately non-interactive.
 */
export function AppVersionLine({ className }: { className?: string }): React.ReactElement {
  const apiVersion = useApiVersion();
  const label = `web ${APP_VERSION} · api ${apiVersion ?? '…'}`;
  return (
    <p
      className={cn('text-muted-foreground text-xs tabular-nums', className)}
      aria-label="Application versions"
      title="Application versions"
    >
      {label}
    </p>
  );
}
