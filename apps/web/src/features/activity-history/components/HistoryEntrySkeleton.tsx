import { Skeleton } from '@/components/ui/page';

/**
 * A history entry's loading shape: the card (`ActivityHistoryItem`'s own classes), an actor-and-time
 * line and two change lines, all `text-sm`. Hidden from assistive technology by its enclosing
 * `LoadingShape`.
 */
export function HistoryEntrySkeleton(): React.ReactElement {
  return (
    <li className="border-border flex flex-col gap-1 rounded-lg border p-3 text-sm">
      <Skeleton className="h-5 w-56" />
      <div className="flex flex-col pl-5">
        <Skeleton className="h-5 w-full max-w-80" />
        <Skeleton className="mt-1 h-5 w-2/3" />
      </div>
    </li>
  );
}
