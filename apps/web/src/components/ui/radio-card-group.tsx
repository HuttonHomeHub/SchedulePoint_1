import { useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * **One of several options, each with a sentence and figures of its own.**
 *
 * `SegmentedControl` answers "which of these short labels?" in a compact track, and its option is a
 * `{ value, label }` rendered as a single button, so it cannot carry an explanation or a set of
 * figures per option. This is the same WAI-ARIA APG radio group (a `radiogroup` of `radio`s with a
 * roving tab stop and Arrow / Home / End) rendered as stacked full-width cards. The first consumer is
 * the TSLD's Arrange dialog, where each option shows what it would do to the diagram.
 *
 * - **Name and description are kept apart.** A card's accessible name is its title alone, so the
 *   options are announced as short as they read. Its description and figures are linked by
 *   `aria-describedby`, so a screen-reader user hears them tied to the option they belong to rather
 *   than floating elsewhere in the dialog.
 * - **A disabled option stays a stop.** It is `aria-disabled`, never native `disabled`, and it is
 *   still reached by the arrow keys, because its reason is the useful part and a stop the keyboard
 *   skips has an unreadable reason (ADR-0082). Arrowing onto it moves focus but not the selection.
 */
export interface RadioCardFigure {
  label: string;
  value: React.ReactNode;
}

export interface RadioCardOption<T extends string> {
  value: T;
  title: string;
  description: React.ReactNode;
  /** Figures for this option, or null while they are not known. */
  figures: readonly RadioCardFigure[] | null;
  /** Shade the option. Its `disabledReason` replaces the figures and must say why. */
  disabled?: boolean;
  disabledReason?: string | null;
}

export interface RadioCardGroupProps<T extends string> {
  /** The group's accessible name. */
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<RadioCardOption<T>>;
  className?: string;
}

export function RadioCardGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: RadioCardGroupProps<T>): React.ReactElement {
  const baseId = useId();
  const refs = useRef<Partial<Record<T, HTMLDivElement | null>>>({});
  const selected = options.findIndex((o) => o.value === value);
  const [focused, setFocused] = useState<number | null>(null);
  // The one tab stop: the option last focused, else the selected one, else the first.
  const stop = focused ?? (selected === -1 ? 0 : selected);

  const focusAt = (index: number): void => {
    const option = options[index];
    if (!option) return;
    setFocused(index);
    refs.current[option.value]?.focus();
    if (!option.disabled) onChange(option.value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number): void => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        focusAt(index === last ? 0 : index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        focusAt(index === 0 ? last : index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(last);
        break;
      case ' ':
      case 'Enter': {
        const option = options[index];
        if (option && !option.disabled) onChange(option.value);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {options.map((option, index) => {
        const titleId = `${baseId}-${String(index)}-title`;
        const descId = `${baseId}-${String(index)}-desc`;
        const figuresId = `${baseId}-${String(index)}-figures`;
        const checked = index === selected;
        const showFigures = !option.disabled && option.figures !== null;
        const describedBy = showFigures ? `${descId} ${figuresId}` : descId;
        return (
          <div
            key={option.value}
            ref={(node) => {
              refs.current[option.value] = node;
            }}
            role="radio"
            aria-checked={checked}
            aria-disabled={option.disabled === true ? true : undefined}
            aria-labelledby={titleId}
            aria-describedby={describedBy}
            tabIndex={index === stop ? 0 : -1}
            onFocus={() => setFocused(index)}
            onClick={() => {
              setFocused(index);
              if (!option.disabled) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'border-input flex cursor-pointer flex-col gap-2 rounded-md border p-3 text-sm',
              'focus-visible:ring-ring outline-none focus-visible:ring-2',
              'aria-checked:border-primary aria-checked:ring-primary aria-checked:ring-1',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'border-input flex size-4 shrink-0 items-center justify-center rounded-full border',
                  checked && 'border-primary',
                )}
              >
                {checked ? <span className="bg-primary size-2 rounded-full" /> : null}
              </span>
              <span id={titleId} className="font-medium">
                {option.title}
              </span>
            </div>
            <div id={descId} className="text-muted-foreground">
              {option.disabled === true && option.disabledReason
                ? option.disabledReason
                : option.description}
            </div>
            {showFigures ? (
              <dl id={figuresId} className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {option.figures!.map((figure) => (
                  <div key={figure.label} className="flex flex-col">
                    <dt className="text-muted-foreground text-xs">{figure.label}</dt>
                    <dd className="text-foreground tabular-nums">{figure.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
