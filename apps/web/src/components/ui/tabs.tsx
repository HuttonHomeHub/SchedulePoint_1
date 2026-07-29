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
 * extends the tab's accessible name ("Scheduling, 3 problems"), so a state on an unfocused tab is
 * announced rather than merely tinted. An unmarked tab's accessible name stays exactly its visible
 * label, keeping name-in-label intact (WCAG 2.5.3).
 *
 * **`orientation="vertical"` renders the list as a rail beside the panel** (ADR-0061 §3). This
 * primitive's first version said, in this docblock, that it would never grow an orientation prop —
 * citing `form.tsx`'s lesson about options added for hypothetical callers. The lesson stands and
 * this is not a violation of it: the option arrives *with* its caller, the activity editor, whose
 * scopes carry per-scope permission state that a horizontal strip has nowhere to put. An option
 * with a real consumer and a test is the opposite of the trap `form.tsx` records.
 *
 * ```tsx
 * <Tabs label="Activity sections" tabs={TABS} active={active} onChange={setActive}>
 *   {(current) => <ActivitySection key={current} section={current} />}
 * </Tabs>
 * ```
 */

/**
 * What a tab needs to say about itself beyond its name.
 *
 * A discriminated union rather than an optional `count`, because the three states are not degrees
 * of one thing: an error demands attention, an unsaved edit records it, and a locked scope explains
 * an absence. Inferring them from whether a number happened to be present is how "3 problems" and
 * "you cannot edit this" ended up rendering as the same dot.
 */
export type TabMarker =
  /** Validation errors — the count is the point, and it outranks everything else. */
  | { kind: 'count'; count: number; label: string }
  /** Presence-only: unsaved edits live here. */
  | { kind: 'dot'; label: string }
  /** This scope is readable but not writable — the permission model, made visible up front. */
  | { kind: 'locked'; label: string };

export interface TabDescriptor<T extends string> {
  id: T;
  label: string;
  /** Present when the tab needs to say something about itself (errors, unsaved edits, a lock). */
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
  /**
   * `'horizontal'` (default) is the strip above the panel. `'vertical'` is a rail beside it —
   * for a dialog whose sections carry per-section state worth reading before you arrive.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Extra classes on the wrapper. Tabs and panel are styled by the primitive, never by callers. */
  className?: string;
}

export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
  orientation = 'horizontal',
  className,
}: TabsProps<T>): React.ReactElement {
  const base = useId();
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const vertical = orientation === 'vertical';

  const tabId = (id: T): string => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  const move = (next: T): void => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === active);
    // A **vertical** rail answers only the vertical arrows: responding to Left/Right too would
    // swallow keystrokes a user aims at the pane's own controls beside it (APG — the tablist's
    // orientation determines which arrows move focus). Horizontal keeps answering both axes, which
    // is what it has always done and is permitted; narrowing it here would be an unrelated
    // behaviour change smuggled in with a layout one.
    const next: string[] = vertical ? ['ArrowDown'] : ['ArrowRight', 'ArrowDown'];
    const previous: string[] = vertical ? ['ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
    switch (true) {
      case next.includes(event.key):
        move(tabs[(index + 1) % tabs.length]!.id);
        break;
      case previous.includes(event.key):
        move(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
        break;
      case event.key === 'Home':
        move(tabs[0]!.id);
        break;
      case event.key === 'End':
        move(tabs[tabs.length - 1]!.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className={cn('flex min-h-0', vertical ? 'flex-row' : 'flex-col', className)}>
      {/* Horizontal: the list scrolls rather than wraps — a wrapped tablist reflows the panel below
          it as the marker set changes, which moves content under the user's cursor mid-edit.
          Vertical: it is a fixed-width rail that scrolls independently of the pane. */}
      <div
        role="tablist"
        aria-label={label}
        {...(vertical ? { 'aria-orientation': 'vertical' as const } : {})}
        className={cn(
          'flex shrink-0',
          vertical
            ? 'bg-muted border-border w-52 flex-col gap-0.5 overflow-y-auto border-r p-2'
            : 'border-border gap-1 overflow-x-auto border-b',
        )}
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
                'focus-visible:ring-ring flex min-h-11 items-center gap-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
                vertical
                  ? 'w-full justify-between rounded-md px-3 py-2 text-left'
                  : '-mb-px border-b-2 px-4',
                vertical
                  ? selected
                    ? 'bg-card text-foreground ring-border shadow-sm ring-1'
                    : 'text-muted-foreground hover:text-foreground'
                  : selected
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              <span className={cn(vertical && 'truncate')}>{tab.label}</span>
              {tab.marker ? (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      tab.marker.kind === 'count'
                        ? 'bg-destructive text-destructive-foreground min-w-5 px-1.5 py-0.5'
                        : tab.marker.kind === 'dot'
                          ? 'bg-primary size-2'
                          : 'text-muted-foreground',
                    )}
                  >
                    {tab.marker.kind === 'count' ? tab.marker.count : null}
                    {/* A padlock glyph, not a colour and not an opacity: "you cannot write here"
                        has to survive a greyscale screenshot and a monochrome display. */}
                    {tab.marker.kind === 'locked' ? '🔒' : null}
                  </span>
                  {/* The marker's meaning in words — this is what makes it more than a glyph. */}
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
        className="focus-visible:ring-ring flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        {children(active)}
      </div>
    </div>
  );
}
