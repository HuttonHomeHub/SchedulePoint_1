import { Skeleton } from '@/components/ui/page/skeleton';
import { cn } from '@/lib/utils';

export interface KeyValueItem {
  /** What the setting or fact is: "Sweep schedule". */
  label: string;
  /** Its value, in words: "Every hour". */
  value: React.ReactNode;
  /**
   * What the value means for the reader, one quieter line beneath it. Rendered as a **second `<dd>`**
   * (a `<dl>` allows several per `<dt>`, and a paragraph here would make the list invalid — the
   * reason `StatGrid`'s `sub` is one).
   */
  consequence?: React.ReactNode;
}

/** Shared with {@link KeyValueListSkeleton}, so the placeholder and the list cannot drift apart. */
const LIST_CLASS = 'grid grid-cols-1 gap-x-8 gap-y-3 @md:grid-cols-2';
const LABEL_CLASS = 'text-muted-foreground text-sm';

export interface KeyValueListProps {
  items: KeyValueItem[];
  className?: string;
}

/**
 * A `<dl>` of label → value: what a thing is set to, in words.
 *
 * **It replaces badges used for settings** — a pill reading "enabled" or "off" beside a label says
 * nothing about what that means and reads as a status, which a setting is not. A value here is a
 * sentence fragment a reader can act on, with its consequence beneath.
 *
 * **The discriminator against its two neighbours**, which are also a `<dl>` of label/value pairs and
 * would otherwise be a coin toss:
 *
 * - **`StatGrid` is headline figures** a reader came to scan — large, numeric, toned. This is the
 *   opposite: text values, one size, nothing to scan for.
 * - **`ContextStrip` is the facts an edit is about**, beside the edit, and forbids interactive
 *   children. This is the subject of a section, not the background to a form.
 *
 * Two columns at the list's own **container** width (`@md`), not the viewport's, for the reason
 * `StatGrid` records: the list sits in a column whose width is decided by its section. The container
 * is a wrapper because an element is never its own query container.
 */
export function KeyValueList({ items, className }: KeyValueListProps): React.ReactElement {
  return (
    <div className={cn('@container', className)}>
      <dl className={LIST_CLASS}>
        {items.map((item, index) => (
          <div key={`${String(index)}-${item.label}`} className="min-w-0">
            <dt className={LABEL_CLASS}>{item.label}</dt>
            <dd className="text-sm wrap-anywhere">{item.value}</dd>
            {item.consequence === undefined ? null : (
              <dd className="text-muted-foreground text-xs wrap-anywhere">{item.consequence}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * `KeyValueList`'s loading shape: the real labels over a value line of the value's own height
 * (`text-sm`, 1.25rem, so `h-5`) and, where the settled item has a consequence, a `text-xs` line
 * (`h-4`). Whether an item HAS a consequence depends on the data, so the caller says which items
 * usually do; an item that turns out not to shortens by one line when it settles.
 */
export interface KeyValueListSkeletonProps {
  items: { label: string; consequence?: boolean }[];
  className?: string;
}

export function KeyValueListSkeleton({
  items,
  className,
}: KeyValueListSkeletonProps): React.ReactElement {
  return (
    <div className={cn('@container', className)} aria-hidden="true">
      <dl className={LIST_CLASS}>
        {items.map((item, index) => (
          <div key={`${String(index)}-${item.label}`} className="min-w-0">
            <dt className={LABEL_CLASS}>{item.label}</dt>
            <dd>
              <Skeleton className="h-5 w-40" />
            </dd>
            {item.consequence === true ? (
              <dd>
                <Skeleton className="h-4 w-56" />
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
