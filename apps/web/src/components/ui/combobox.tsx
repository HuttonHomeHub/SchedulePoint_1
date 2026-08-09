import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { cn } from '@/lib/utils';

/**
 * A hand-rolled **combobox** (WAI-ARIA APG "Combobox with List Autocomplete") on semantic HTML —
 * no new dependency, following the same house idiom as {@link Menu}: one primitive, ARIA and
 * keyboard behaviour owned here, styling from semantic tokens only.
 *
 * It exists because a native `<select>` cannot do what a library picker needs at scale
 * (ADR-0053 §4 / US-8): **type-ahead filtering against the server**, a "load more" page, and
 * options that carry a tier/state annotation. It replaces the four raw `<Select>` pickers
 * (plan calendar, activity calendar, resource calendar, assignment resource).
 *
 * **It is deliberately presentational and fully controlled.** It never fetches: the consumer
 * owns `options`, `query`/`onQueryChange` (so it can debounce and pick its own query key) and
 * `onLoadMore`. That keeps the primitive free of feature code (`docs/COMPONENT_LIBRARY.md`
 * tier rules) and lets the same component sit over a paged server search, a local array, or a
 * tree.
 *
 * Behaviours worth knowing:
 * - **The current value always renders**, even when the server page it came from is filtered
 *   out — `selectedLabel` supplies its text (generalising the `missingCurrent` trick the
 *   calendar pickers each grew separately). A selection can therefore never silently blank, and
 *   that includes the `emptyOption` selection (`value=''` shows "None"/"Inherit", exactly as the
 *   native `<select>` it replaces did).
 * - **"Load more" is keyboard-operable** — it is the last row in the arrow-key sequence, not a
 *   pointer-only button, so page 2+ of a server-searched library is reachable without a mouse.
 * - **Grouped options** (`group`) render as `role="group"` with a visible, associated label —
 *   used for the ADR-0053 tier groups ("Organisation" / "This project").
 * - **Disabled options** are announced (`aria-disabled`) and skipped by keyboard navigation,
 *   so an unusable choice stays discoverable without being operable.
 * - **The listbox is positioned in-flow (absolute), not portalled** — unlike `Menu`. Its main
 *   consumers live inside the native `<dialog>` used by {@link Dialog}, and a portal to
 *   `document.body` would render *behind* the dialog's top layer.
 *
 * Scope is intentionally minimal: single-select, list autocomplete (the input filters; it never
 * auto-completes inline), no multi-select and no free-text entry. A consumer needing more should
 * extend this primitive rather than fork it.
 */

/** One selectable row. `value` is the id the consumer round-trips; `label` is what is shown. */
export interface ComboboxOption {
  value: string;
  label: string;
  /**
   * Group key. Options sharing a key are rendered together under one `role="group"` with a
   * visible label taken from `groupLabels`. Ungrouped options render before every group, in the
   * order given.
   */
  group?: string;
  /**
   * A short trailing annotation — the tier ("Project") or lifecycle ("Archived") badge. It is
   * part of the option's ACCESSIBLE NAME, not a decorative pill, so a screen-reader user hears
   * "Standard, Archived" and not just "Standard".
   */
  badge?: string;
  /** Tree depth, rendered as indentation. Never the only cue — pair it with a `badge` or group. */
  depth?: number;
  /** Present but not selectable (`aria-disabled`); skipped by arrow keys, ignored on click. */
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Input id — the consumer's `<Label htmlFor>` target. */
  id: string;
  /** The selected option's value; `''` means nothing is selected. */
  value: string;
  onChange: (value: string) => void;
  /** The current search term. Controlled, so the consumer owns debouncing and fetching. */
  query: string;
  onQueryChange: (query: string) => void;
  options: readonly ComboboxOption[];
  /**
   * Display text for `value` when it is not in `options` (a stale page, a filtered-out row, an
   * archived selection). Falls back to a "Loading…"/"Unavailable" placeholder so the field is
   * never blank while a value is set.
   */
  selectedLabel?: string | undefined;
  /** Visible label for each `group` key used by `options`. */
  groupLabels?: Readonly<Record<string, string>> | undefined;
  /** A "no selection" row, e.g. "Inherit from plan". Selecting it emits `''`. */
  emptyOption?: { label: string } | undefined;
  /** A request is in flight — sets `aria-busy` and shows a status row instead of "No matches". */
  loading?: boolean;
  /** The last load failed; shows an error row (the consumer surfaces the real message). */
  errored?: boolean;
  /**
   * More pages exist; renders a "Load more" row that calls `onLoadMore` without closing. The row
   * is the last stop in the arrow-key sequence and activates on Enter as well as pointer, so
   * page 2+ is reachable without a mouse (WCAG 2.1.1).
   */
  hasMore?: boolean;
  onLoadMore?: (() => void) | undefined;
  placeholder?: string;
  disabled?: boolean;
  /**
   * **Shut, but still readable** (ADR-0083 D1 row 4). The text input takes `readOnly`, the toggle
   * takes `aria-disabled`, and the listbox refuses to open — so the reader can still focus the
   * control, read the selected value and copy it, which is what "you may read this but not write
   * it" means and what `disabled` takes away.
   *
   * Use this for a permission, a pen, an in-flight save or a domain rule. `disabled` stays for the
   * two states that hold no value at all: the options have not loaded, or a field above this one
   * has not been answered.
   */
  readOnly?: boolean;
  /** Shown when there are no options and nothing is loading. */
  emptyMessage?: string;
  /** Ids of help/error text describing the field, merged into the input's `aria-describedby`. */
  describedBy?: string | undefined;
  invalid?: boolean;
  /** Accessible name for the toggle button (defaults to a generic one). */
  toggleLabel?: string;
  /**
   * The text input's DOM node, for a consumer that must move focus to it — chiefly restoring focus
   * after a `disabled` spell (disabling the focused field drops focus to `<body>`; WCAG 2.4.3).
   * Optional: the component owns its own ref when this is absent.
   */
  inputRef?: React.RefObject<HTMLInputElement | null> | undefined;
}

/** A row in the rendered list: a real option, or one of the non-selectable status rows. */
interface RenderRow {
  option: ComboboxOption;
  /** Index among the SELECTABLE options — the `activeIndex` space. `-1` = not selectable. */
  activeIndex: number;
}

const PLACEHOLDER_LOADING = 'Loading…';
const PLACEHOLDER_UNAVAILABLE = 'Unavailable';

/** The full accessible name of an option: its label plus its badge, if any. */
function optionText(option: ComboboxOption): string {
  return option.badge ? `${option.label}, ${option.badge}` : option.label;
}

export function Combobox({
  id,
  value,
  onChange,
  query,
  onQueryChange,
  options,
  selectedLabel,
  groupLabels,
  emptyOption,
  loading = false,
  errored = false,
  hasMore = false,
  onLoadMore,
  placeholder,
  disabled = false,
  readOnly = false,
  emptyMessage = 'No matches.',
  describedBy,
  invalid = false,
  toggleLabel = 'Show options',
  inputRef: externalInputRef,
}: ComboboxProps): React.ReactElement {
  const announce = useAnnounce();
  const listboxId = `${id}-listbox`;
  const groupIdPrefix = useId();
  const ownInputRef = useRef<HTMLInputElement>(null);
  // One ref either way: the consumer's when given, else our own. There is a single input, so
  // there is nothing to merge.
  const inputRef = externalInputRef ?? ownInputRef;
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // The selected option, whether or not the current page still contains it. When the server page
  // has filtered it out we synthesise a row from `selectedLabel` so the field never blanks and
  // the user can always see (and keep) what they chose — US-8's "current value outside the
  // filtered page" rule, previously re-implemented in each picker.
  //
  // `''` is a REAL selection whenever the consumer supplies an `emptyOption` ("None (all days
  // work)", "Plan default (inherit)", "Top level"): a native `<select value="">` always showed
  // that option's text, so blanking the field here would lose the control's state for sighted
  // and AT users alike (WCAG 4.1.2 / 1.3.1). Only a `''` with NO empty option is "nothing
  // selected" — that is the placeholder's job.
  const selectedOption = useMemo<ComboboxOption | null>(() => {
    if (value === '') return emptyOption ? { value: '', label: emptyOption.label } : null;
    const found = options.find((option) => option.value === value);
    if (found) return found;
    return {
      value,
      label: selectedLabel ?? (loading ? PLACEHOLDER_LOADING : PLACEHOLDER_UNAVAILABLE),
    };
  }, [value, options, emptyOption, selectedLabel, loading]);

  // Rows in DOM order: the empty option, then the selected-but-missing row, then ungrouped
  // options, then each group. Selectable rows are numbered so `activeIndex` — and therefore
  // `aria-activedescendant` — addresses exactly the rows the arrow keys can reach.
  const { rows, groups, selectableCount } = useMemo(() => {
    const leading: ComboboxOption[] = [];
    if (emptyOption) leading.push({ value: '', label: emptyOption.label });
    // The `''` selection is ALREADY the empty-option row above — re-adding it would render a
    // duplicate. Only a real id that the current page no longer carries needs a synthesised row.
    if (
      selectedOption &&
      selectedOption.value !== '' &&
      !options.some((option) => option.value === selectedOption.value)
    ) {
      leading.push(selectedOption);
    }

    const ungrouped = options.filter((option) => option.group === undefined);
    const grouped = new Map<string, ComboboxOption[]>();
    for (const option of options) {
      if (option.group === undefined) continue;
      const bucket = grouped.get(option.group);
      if (bucket) bucket.push(option);
      else grouped.set(option.group, [option]);
    }

    let next = 0;
    const toRow = (option: ComboboxOption): RenderRow => ({
      option,
      activeIndex: option.disabled === true ? -1 : next++,
    });

    const flat = [...leading, ...ungrouped].map(toRow);
    const groupRows = [...grouped.entries()].map(([key, members]) => ({
      key,
      rows: members.map(toRow),
    }));
    return { rows: flat, groups: groupRows, selectableCount: next };
  }, [emptyOption, selectedOption, options]);

  const selectable = useMemo(
    () => [...rows, ...groups.flatMap((group) => group.rows)].filter((row) => row.activeIndex >= 0),
    [rows, groups],
  );

  // "Load more" is the LAST row in the arrow-key sequence, not a pointer-only affordance: it is
  // the only way to reach page 2+ of a server-searched library, so leaving it off the keyboard
  // path stranded keyboard users on the first 20 rows (WCAG 2.1.1 Keyboard). It is a real
  // `role="option"` so `aria-activedescendant` can address it, but activating it loads a page
  // instead of committing a value — the popup stays open and the selection is untouched.
  const loadMoreVisible = hasMore && !loading;
  const loadMoreIndex = loadMoreVisible ? selectableCount : -1;
  const navigableCount = selectableCount + (loadMoreVisible ? 1 : 0);
  const loadMoreId = `${id}-load-more`;
  const loadMoreActive = loadMoreIndex >= 0 && activeIndex === loadMoreIndex;

  const activeOption = selectable.find((row) => row.activeIndex === activeIndex)?.option;
  const activeDescendantId = loadMoreActive
    ? loadMoreId
    : activeOption
      ? `${id}-option-${activeOption.value}`
      : undefined;

  // Announce the result count whenever the list changes while open — a filtered listbox that
  // silently shrinks is invisible to a screen-reader user (WCAG 4.1.3 Status Messages).
  // "No results" is about the SUPPLIED options, not the reachable rows: a picker with an
  // `emptyOption` ("Inherit from plan") or a still-rendered current value always has something
  // selectable, and reporting "1 result" for a search that matched nothing would be a lie.
  const noResults = options.length === 0;

  const lastAnnounced = useRef<string>('');
  useEffect(() => {
    if (!open || loading) return;
    const message = noResults
      ? emptyMessage
      : selectableCount === 0
        ? emptyMessage
        : `${selectableCount} result${selectableCount === 1 ? '' : 's'} available.`;
    if (message === lastAnnounced.current) return;
    lastAnnounced.current = message;
    announce(message);
  }, [open, loading, noResults, selectableCount, emptyMessage, announce]);

  // Close on a pointer press outside, and on Escape. Escape is a capture-phase document listener
  // (the `Menu` precedent) so it closes the popup WITHOUT also closing a surrounding Dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    };
    const onPointer = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, inputRef]);

  // Keep the active option in view during keyboard navigation (the list scrolls).
  useEffect(() => {
    if (!open || activeDescendantId === undefined) return;
    const element = listRef.current?.querySelector(`#${CSS.escape(activeDescendantId)}`);
    // Guarded: `scrollIntoView` is a progressive enhancement (keeping the active row visible in
    // a scrolling popup) and is absent in jsdom, so it must never be load-bearing.
    if (element instanceof HTMLElement && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeDescendantId]);

  const commit = (option: ComboboxOption): void => {
    if (option.disabled === true) return;
    onChange(option.value);
    // Clear the search on commit so reopening shows the full list rather than the stale term —
    // and so the closed input shows the SELECTION, not what was typed to find it.
    onQueryChange('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const openList = (index: number): void => {
    // Opening always starts from the FULL list: a stale term from a previous visit would
    // silently hide the very options the user is about to look for.
    onQueryChange('');
    setOpen(true);
    setActiveIndex(index);
  };

  /** Load the next page without closing the popup or disturbing the active row (APG). */
  const loadMore = (): void => {
    onLoadMore?.();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const last = navigableCount - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList(0);
        else setActiveIndex(activeIndex >= last ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        // Opening upwards lands on the last real OPTION, never the trailing "Load more" action —
        // APG's "moves focus to the last option", and an action is a poor first thing to meet.
        if (!open) openList(selectableCount - 1);
        else setActiveIndex(activeIndex <= 0 ? last : activeIndex - 1);
        break;
      case 'Home':
        // Only hijack Home/End for list navigation while the popup is open; with it closed they
        // must still move the caret in the text field (SC 2.1.1 — do not break the text input).
        if (!open) break;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (!open) break;
        event.preventDefault();
        setActiveIndex(last);
        break;
      case 'Enter':
        if (!open) break;
        if (loadMoreActive) {
          // Inside a Dialog an unhandled Enter would submit the form; loading a page must not.
          event.preventDefault();
          loadMore();
          break;
        }
        if (activeOption === undefined) break;
        event.preventDefault();
        commit(activeOption);
        break;
      case 'Tab':
        // APG: Tab accepts nothing implicitly — it just dismisses the popup and moves on, so
        // focus order stays predictable (SC 2.4.3). The native Tab is allowed to proceed.
        if (open) setOpen(false);
        break;
    }
  };

  const displayValue = open ? query : (selectedOption?.label ?? '');

  const renderOption = (row: RenderRow): React.ReactElement => {
    const { option } = row;
    const isSelected = option.value === value;
    const isActive = row.activeIndex >= 0 && row.activeIndex === activeIndex;
    return (
      <div
        key={option.value === '' ? '__empty__' : option.value}
        id={`${id}-option-${option.value}`}
        role="option"
        aria-selected={isSelected}
        {...(option.disabled === true ? { 'aria-disabled': true } : {})}
        // The option carries its badge in the accessible name, so the visible badge span is
        // hidden from AT to avoid announcing it twice.
        aria-label={optionText(option)}
        onPointerDown={(event) => {
          // Commit on pointer-DOWN, before the input can blur — a pointerup/click handler would
          // race the outside-press listener above and drop the selection.
          event.preventDefault();
          commit(option);
        }}
        className={cn(
          'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
          option.disabled === true && 'text-muted-foreground cursor-default',
          // The active option is highlighted with a ring as well as a tint: `bg-accent` alone is
          // ~1.09:1 on the popover surface and fails WCAG 1.4.11 (the `MenuItem` precedent).
          isActive &&
            option.disabled !== true &&
            'bg-accent text-accent-foreground ring-ring ring-2 ring-inset',
        )}
      >
        <span
          className="truncate"
          style={option.depth ? { paddingInlineStart: `${option.depth * 0.75}rem` } : undefined}
        >
          {option.label}
        </span>
        {option.badge ? (
          <span aria-hidden="true" className="text-muted-foreground shrink-0 text-xs">
            {option.badge}
          </span>
        ) : null}
      </div>
    );
  };

  const statusRow = (text: string): React.ReactElement => (
    // `presentation` keeps a non-selectable row out of the option count a screen reader reports.
    <div role="presentation" className="text-muted-foreground px-2 py-1.5 text-sm">
      {text}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          // List autocomplete: typing filters the list, it never rewrites the input for you.
          aria-autocomplete="list"
          {...(activeDescendantId ? { 'aria-activedescendant': activeDescendantId } : {})}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          {...(invalid ? { 'aria-invalid': true } : {})}
          aria-busy={loading}
          disabled={disabled}
          // NOT `aria-disabled`: a read-only combobox IS operable — focusable, caret-placeable,
          // selectable, copyable — and `readonly` already maps to `aria-readonly` through HTML-AAM.
          // A second, contrary state would be a false announcement (ADR-0083 D1).
          readOnly={readOnly}
          value={displayValue}
          placeholder={placeholder}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={readOnly ? undefined : onKeyDown}
          onBlur={() => setOpen(false)}
          className={cn(
            'border-input bg-field text-field-foreground ring-offset-background flex h-10 w-full rounded-md border py-2 pr-9 pl-3 text-sm transition-colors',
            'placeholder:text-field-muted-foreground',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-destructive-text aria-[invalid=true]:focus-visible:ring-destructive-text',
          )}
        />
        <button
          type="button"
          // Not a tab stop: the input is the single focusable control (APG). The button is a
          // pointer affordance that reveals the list; keyboard users press ↓.
          tabIndex={-1}
          aria-label={toggleLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          {...(readOnly ? { 'aria-disabled': true } : {})}
          onPointerDown={(event) => {
            event.preventDefault();
            // The listbox refuses to open rather than the button leaving the page: a shut control
            // that vanishes is the dead end this ADR exists to remove.
            if (readOnly) return;
            if (open) setOpen(false);
            else openList(-1);
            inputRef.current?.focus();
          }}
          className="text-muted-foreground absolute inset-y-0 right-0 flex w-9 items-center justify-center disabled:opacity-50"
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/*
        The listbox is always in the DOM (hidden when closed) so `aria-controls` always resolves
        to a real element — a dangling id is an ARIA failure some AT reports as a broken widget.
      */}
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={toggleLabel}
        hidden={!open}
        className={cn(
          'border-border bg-popover text-popover-foreground absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border p-1 shadow-md',
        )}
      >
        {rows.map(renderOption)}
        {groups.map((group) => (
          // `role="group"` inside a listbox is the APG structure for a categorised list; the
          // label is a real element referenced by `aria-labelledby`, so it is announced when the
          // user arrows into the group and is visible to everyone else.
          <div key={group.key} role="group" aria-labelledby={`${groupIdPrefix}-${group.key}`}>
            <div
              id={`${groupIdPrefix}-${group.key}`}
              role="presentation"
              className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium"
            >
              {groupLabels?.[group.key] ?? group.key}
            </div>
            {group.rows.map(renderOption)}
          </div>
        ))}
        {loading ? statusRow('Loading…') : null}
        {errored && !loading ? statusRow('Could not load options.') : null}
        {!loading && !errored && (noResults || selectableCount === 0)
          ? statusRow(emptyMessage)
          : null}
        {loadMoreVisible ? (
          // A real option (not a `tabIndex={-1}` button) so it sits in the arrow-key sequence and
          // `aria-activedescendant` can address it — see `loadMoreIndex` above. `aria-selected` is
          // false because it is an action, not a value.
          <div
            id={loadMoreId}
            role="option"
            aria-selected={false}
            aria-label="Load more results"
            onPointerDown={(event) => {
              // Loading another page must NOT close the popup or move the selection.
              event.preventDefault();
              loadMore();
            }}
            className={cn(
              'text-muted-foreground hover:text-foreground w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm underline',
              loadMoreActive && 'bg-accent text-accent-foreground ring-ring ring-2 ring-inset',
            )}
          >
            Load more
          </div>
        ) : null}
      </div>
    </div>
  );
}
