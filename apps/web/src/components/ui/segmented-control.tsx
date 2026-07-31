import { useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A **segmented control** — the WAI-ARIA APG `radiogroup` pattern: roving `tabindex`,
 * Arrow/Home/End, `aria-checked`, and focus that follows selection.
 *
 * **Segmented control vs {@link ToggleChip}, and the rule for choosing:**
 * a segmented control is for a **mutually-exclusive choice from a known set** — "one of these",
 * where picking one un-picks the rest (Diagram *or* Activities; Day *or* Month *or* Year). A chip
 * is for an **independent boolean** — "also show this", where each one stands alone. The
 * distinction is not cosmetic: radios tell assistive technology "one of a set of N", and using
 * them for independent booleans (or buttons for a single choice) misdescribes the control.
 *
 * Focus follows selection because the control *is* the thing the user is acting on — arrowing to
 * an option selects it, which is the APG's recommended behaviour for radio groups whose effect is
 * immediate.
 *
 * `value` may be `null` for a group with **no selection yet** — a question the user has not answered
 * rather than one with a default. The APG rule then applies: the FIRST option takes the group's
 * single tab stop, so the group is still reachable. (Deriving the tab stop from `value === option`
 * alone would give every option `tabIndex={-1}` and make an unanswered group keyboard-unreachable —
 * WCAG 2.1.1.)
 *
 * ```tsx
 * <SegmentedControl
 *   label="Workspace view"
 *   value={pane}
 *   onChange={setPane}
 *   options={[
 *     { value: 'diagram', label: 'Diagram' },
 *     { value: 'activities', label: 'Activities' },
 *   ]}
 * />
 * ```
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group — always required; a bare radiogroup is unnameable. */
  label: string;
  /** `null` when nothing is chosen yet — see the APG note above. */
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Extra classes on the group element. Options are styled by the primitive, never by callers. */
  className?: string;
  /** Extra classes on each option — for touch-target or flex sizing only, never colour. */
  optionClassName?: string;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  optionClassName,
}: SegmentedControlProps<T>): React.ReactElement {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const move = (next: T): void => {
    onChange(next);
    refs.current[next]?.focus();
  };
  const selectedIndex = options.findIndex((o) => o.value === value);
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    // With no selection the cursor sits before the first option, so Right lands on the first and
    // Left on the last — the same wrap the selected case gets, from a defined starting point.
    const idx = selectedIndex;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(options[(idx + 1) % options.length]!.value);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        move(
          options[idx === -1 ? options.length - 1 : (idx - 1 + options.length) % options.length]!
            .value,
        );
        break;
      case 'Home':
        move(options[0]!.value);
        break;
      case 'End':
        move(options[options.length - 1]!.value);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-1', className)}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            refs.current[option.value] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value || (selectedIndex === -1 && index === 0) ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
            optionClassName,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
