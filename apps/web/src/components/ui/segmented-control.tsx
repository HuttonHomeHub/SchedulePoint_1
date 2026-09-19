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
  /**
   * Id of a VISIBLE element that already names the group, used instead of `label` as the accessible
   * name. Prefer this whenever the name is on screen: `aria-label` would leave a serial reader
   * hearing the same word twice, once from the caption and once from the group. `label` stays
   * required so the control can never end up unnamed if the id is wrong.
   */
  labelledById?: string;
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
  labelledById,
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
    <div
      role="radiogroup"
      {...(labelledById === undefined
        ? { 'aria-label': label }
        : { 'aria-labelledby': labelledById })}
      /**
       * **A track, so the group reads as one control rather than as a row of words.**
       *
       * The product owner reported the audit log's filters as looking "out of place and not
       * designed to be part of the page", and reading the two controls side by side showed why:
       * `ToggleChip` unpressed is a bordered pill and this control unselected was
       * `text-muted-foreground` with no border and no fill. On the same row, 20px apart, doing the
       * same job. With nothing chosen — the default state — all three options were bare text beside
       * four pills.
       *
       * **The boundary is `--input`, and the first version of this got it wrong in a way nothing
       * could see.** That version distinguished the states by FILL alone — a `bg-background` option
       * raised out of a `bg-muted` track — and the accessibility review measured that pair at
       * **1.01–1.26:1 across all seven scopes**, with `panel` and `canvas` at 1.01. WCAG 1.4.11
       * wants 3:1 for the visual information that identifies a control and its state. The component
       * review reached the same place from the other end: `--muted` (L 0.965) is LIGHTER than
       * `--background` (L 0.914) on this theme, so the "raised" option was in fact the darker one,
       * and `tabs.tsx:140,169` already expresses this exact motif with `bg-card` over `bg-muted`.
       *
       * So the track carries a real `border-input` edge and the selected option carries a matching
       * ring. `--input` is the token this system reserves for a control's own outline and gates at
       * 3:1 for that reason (ADR-0055 §1) — the same token `ToggleChip` unpressed reaches for, and
       * deliberately not `--border`, which is a decorative divider and 1.4.11-exempt. The pair is
       * now in `token-contrast.test.ts`; it was in nothing before.
       *
       * **`bg-card` was tried for the selected fill and refused by `reset-fills.structural.test.ts`,
       * correctly.** `--card` is an ADR-0097 reset pinned at maximum lightness in EVERY scope, which
       * is exactly why it looked attractive here — and exactly why it is wrong: this control can be
       * mounted inside any `<Surface>`, so on the navy chrome band a selected option would paint
       * white. The reset is not built (`docs/TECH_DEBT.md` #279), so it would ignore the scope
       * rather than adapt to it.
       *
       * So the fill stays `bg-background`, which is rebound per scope. **It is not the accessible
       * channel and is not asked to be** — the component review is right that on this theme
       * `--muted` is lighter than `--background`, so the fill alone would read as sunken. The ring
       * is what identifies the state at 3:1; the fill and the shadow are reinforcement. That is the
       * honest reading of what these tokens can carry: no scope-safe fill pair in this system
       * clears 3:1 against `--muted`, which is why the first version failed and why a border was
       * always going to be the answer.
       *
       * **Nothing about the keyboard model changes** — roving `tabindex`, Arrow/Home/End,
       * focus-follows-selection, `aria-checked` and the unselected-group tab-stop rule are
       * untouched, and the existing suite passing unchanged is the proof rather than a paragraph.
       */
      className={cn(
        'bg-muted border-input inline-flex w-fit gap-1 rounded-md border p-1',
        className,
      )}
    >
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
            // `ring-offset-background` is not decoration: without it Tailwind's
            // `--tw-ring-offset-color` falls back to its `@property` initial value, a hardcoded
            // `#fff`, so a control focused on a navy surface would draw a white gap around its
            // amber ring — 2.02:1, and invisible. Every sibling primitive (`Button`, `Input`,
            // `TextLink`, `ToggleChip`) carries it and this one did not. Not currently reachable:
            // all four live consumers render at page scope. Added before it becomes reachable,
            // because the failure mode is a focus ring you cannot see, which looks exactly like a
            // focus ring you have not triggered.
            'focus-visible:ring-ring focus-visible:ring-offset-background rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            /**
             * **The selected option is raised off the track; the unselected ones sit in it.**
             * Unselected options carry no border of their own — three borders inside a bordered
             * group is the "comb" ADR-0065 M3 describes one surface along — so the group's edge
             * identifies the control and the selected option's ring identifies the state. Both are
             * `--input` and both are measured (see the group's docblock above); the fill and the
             * shadow are the second and third channels, not the only ones (WCAG 1.4.1).
             */
            value === option.value
              ? 'bg-background text-foreground ring-input shadow-sm ring-1'
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
