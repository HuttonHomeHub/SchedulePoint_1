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
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 @md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-muted-foreground text-sm">{item.label}</dt>
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
