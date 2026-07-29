import { useId, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A **tabbed section navigator** — the WAI-ARIA APG `tablist` pattern, hand-rolled on semantic HTML
 * in the lineage of {@link Menu} and {@link Combobox}: roving `tabindex`, Arrow/Home/End,
 * `aria-selected`, and a single panel rendered from a render prop.
 *
 * **Automatic activation** (arrowing selects, not merely focuses) is the APG's recommendation when
 * revealing a panel is cheap — here every panel's data is already in memory, so there is nothing to
 * wait for and manual activation would only add a keystroke.
 *
 * **The panel carries `tabIndex={0}`**, which the APG recommends *only* for panels with no focusable
 * children. That guidance assumes a panel that fits; ours is a scroll container inside a dialog, and
 * a scrollable region that is not focusable cannot be scrolled by keyboard at all (WCAG 2.1.1). The
 * conflict is real and 2.1.1 wins — the cost is one extra tab stop, the alternative is content a
 * keyboard user cannot reach. Recorded in ADR-0060 rather than left as a silent deviation.
 *
 * **Markers are text, never colour** (WCAG 1.4.1): a marker renders a visible glyph or count *and*
 * extends the tab's accessible name ("Scheduling, 3 problems"), so a validation error on an
 * unfocused tab is announced rather than merely tinted. An unmarked tab's accessible name stays
 * exactly its visible label, keeping name-in-label intact (WCAG 2.5.3).
 *
 * This primitive has **one consumer** (`ActivityEditorDialog`) and is built for it deliberately —
 * no `renderTab` escape hatch, no orientation prop, no lazy-mount option. `form.tsx` records what
 * happens when a primitive grows options for a hypothetical second caller.
 *
 * ```tsx
 * <Tabs label="Activity sections" tabs={TABS} active={active} onChange={setActive}>
 *   {(current) => <ActivitySection key={current} section={current} />}
 * </Tabs>
 * ```
 */
export interface TabMarker {
  /** Optional count rendered as a badge. Omit for a presence-only marker (the dirty dot). */
  count?: number;
  /**
   * How the marker reads aloud, appended to the tab's label as ", <label>" — e.g. `3 problems`,
   * `unsaved changes`. Always required when a marker is present: a marker nobody can hear is
   * colour-only meaning.
   */
  label: string;
}

export interface TabDescriptor<T extends string> {
  id: T;
  label: string;
  /** Present when the tab needs to say something about itself (errors, unsaved edits). */
  marker?: TabMarker;
}

export interface TabsProps<T extends string> {
  /** Accessible name for the tablist — always required; a bare tablist is unnameable. */
  label: string;
  tabs: ReadonlyArray<TabDescriptor<T>>;
  active: T;
  onChange: (id: T) => void;
  /** Renders the active panel's content. Called with the active id on every render. */
  children: (active: T) => React.ReactNode;
  /** Extra classes on the wrapper. Tabs and panel are styled by the primitive, never by callers. */
  className?: string;
}

export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
  className,
}: TabsProps<T>): React.ReactElement {
  const base = useId();
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  const tabId = (id: T): string => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  const move = (next: T): void => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === active);
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(tabs[(index + 1) % tabs.length]!.id);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        move(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
        break;
      case 'Home':
        move(tabs[0]!.id);
        break;
      case 'End':
        move(tabs[tabs.length - 1]!.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* The list scrolls rather than wraps: a wrapped tablist reflows the panel below it as the
          marker set changes, which moves the content under the user's cursor mid-edit. */}
      <div
        role="tablist"
        aria-label={label}
        className="border-border flex shrink-0 gap-1 overflow-x-auto border-b"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={onKeyDown}
              className={cn(
                // min-h-11 keeps the target ≥ 24px with room to spare (WCAG 2.5.8); whitespace-nowrap
                // stops a two-word label wrapping into a taller, ragged tab.
                'focus-visible:ring-ring -mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
                selected
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {tab.label}
              {tab.marker ? (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex items-center justify-center rounded-full text-xs font-semibold',
                      tab.marker.count === undefined
                        ? 'bg-primary size-2'
                        : 'bg-destructive text-destructive-foreground min-w-5 px-1.5 py-0.5',
                    )}
                  >
                    {tab.marker.count === undefined ? null : tab.marker.count}
                  </span>
                  {/* The marker's meaning in words — this is what makes it more than a colour. */}
                  <span className="sr-only">, {tab.marker.label}</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        tabIndex={0}
        className="focus-visible:ring-ring min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        {children(active)}
      </div>
    </div>
  );
}
