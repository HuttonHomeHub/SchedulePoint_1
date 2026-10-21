import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { Combobox, type ComboboxOption, type ComboboxProps } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';

/**
 * Behaviour + a11y contract for the shared APG combobox (ADR-0053 §4 / US-8). The keyboard
 * cases are the merge requirement: this primitive replaces four native `<select>`s, so anything
 * a native select could do by keyboard must still work.
 */

const OPTIONS: ComboboxOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

/** Renders the combobox with a real label and controlled `value`/`query`, like a consumer does. */
function Harness({
  onChange,
  onQueryChange,
  ...props
}: Partial<ComboboxProps> & {
  onChange?: (value: string) => void;
  onQueryChange?: (query: string) => void;
}): React.ReactElement {
  const [value, setValue] = useState(props.value ?? '');
  const [query, setQuery] = useState('');
  return (
    <AnnouncerProvider>
      <Label htmlFor="cb">Thing</Label>
      <Combobox
        id="cb"
        options={OPTIONS}
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          onQueryChange?.(next);
        }}
      />
    </AnnouncerProvider>
  );
}

const input = (): HTMLElement => screen.getByRole('combobox', { name: 'Thing' });
const openWithKeyboard = (): void => {
  fireEvent.keyDown(input(), { key: 'ArrowDown' });
};

describe('Combobox', () => {
  describe('ARIA structure', () => {
    it('is a labelled combobox owning a hidden listbox until it is opened', () => {
      render(<Harness />);
      expect(input()).toHaveAttribute('aria-expanded', 'false');
      expect(input()).toHaveAttribute('aria-autocomplete', 'list');
      // The listbox element exists even when closed so `aria-controls` never dangles, but it is
      // hidden, so it is not exposed as a listbox to AT.
      expect(input()).toHaveAttribute('aria-controls', 'cb-listbox');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('exposes each option with its selected state', () => {
      render(<Harness value="b" />);
      openWithKeyboard();
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Bravo' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute(
        'aria-selected',
        'false',
      );
    });

    it('folds a badge into the option’s accessible name rather than leaving it decorative', () => {
      render(<Harness options={[{ value: 'a', label: 'Alpha', badge: 'Archived' }]} />);
      openWithKeyboard();
      expect(screen.getByRole('option', { name: 'Alpha, Archived' })).toBeInTheDocument();
    });

    it('groups options under an associated, visible group label', () => {
      render(
        <Harness
          options={[
            { value: 'a', label: 'Alpha', group: 'org' },
            { value: 'b', label: 'Bravo', group: 'project' },
          ]}
          groupLabels={{ org: 'Organisation', project: 'This project' }}
        />,
      );
      openWithKeyboard();
      const group = screen.getByRole('group', { name: 'Organisation' });
      expect(within(group).getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'This project' })).toBeInTheDocument();
    });
  });

  describe('keyboard operation', () => {
    it('ArrowDown opens the list and makes the first option active', () => {
      render(<Harness />);
      openWithKeyboard();
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-a');
    });

    it('ArrowUp on a closed list opens it at the LAST option', () => {
      render(<Harness />);
      fireEvent.keyDown(input(), { key: 'ArrowUp' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
    });

    it('ArrowDown/ArrowUp move the active option and wrap around', () => {
      render(<Harness />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-b');
      // Wrap forward off the end…
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-a');
      // …and backward off the start.
      fireEvent.keyDown(input(), { key: 'ArrowUp' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
    });

    it('Home/End jump to the first and last options', () => {
      render(<Harness />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'End' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
      fireEvent.keyDown(input(), { key: 'Home' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-a');
    });

    it('leaves Home/End to the text caret while the list is closed', () => {
      render(<Harness />);
      const event = fireEvent.keyDown(input(), { key: 'Home' });
      // `fireEvent` returns false when the handler called preventDefault; the closed combobox
      // must NOT hijack Home, or the field stops behaving like a text input (SC 2.1.1).
      expect(event).toBe(true);
      expect(input()).toHaveAttribute('aria-expanded', 'false');
    });

    it('Enter selects the active option and closes', () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('b');
      expect(input()).toHaveAttribute('aria-expanded', 'false');
      expect(input()).toHaveValue('Bravo');
    });

    it('Enter with nothing active does not select and lets the event through', () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Escape closes the list, keeps focus in the field, and does not escape the popup', () => {
      const onOuterEscape = vi.fn();
      render(
        // A bare bubble-listener stand-in for a surrounding Dialog — never a real control, so the
        // interactive-element rule doesn't apply to it.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onKeyDown={onOuterEscape}>
          <Harness />
        </div>,
      );
      openWithKeyboard();
      onOuterEscape.mockClear(); // the opening ArrowDown legitimately bubbled
      fireEvent.keyDown(input(), { key: 'Escape' });
      expect(input()).toHaveAttribute('aria-expanded', 'false');
      expect(input()).toHaveFocus();
      // The capture-phase document listener stops propagation before the event ever reaches the
      // input, so a surrounding Dialog does not also close on the same Escape.
      expect(onOuterEscape).not.toHaveBeenCalled();
    });

    it('Tab dismisses the list without selecting', () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'Tab' });
      expect(input()).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('type-ahead filters via the controlled query and re-opens the list', () => {
      const onQueryChange = vi.fn();
      render(<Harness onQueryChange={onQueryChange} />);
      fireEvent.change(input(), { target: { value: 'brav' } });
      expect(onQueryChange).toHaveBeenCalledWith('brav');
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      // Typing resets the active option — the old one may no longer be in the results.
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });
  });

  describe('disabled options', () => {
    const withDisabled: ComboboxOption[] = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo', disabled: true },
      { value: 'c', label: 'Charlie' },
    ];

    // A posture change, not a bent test: the APG's "Options in a Listbox" keeps an unavailable
    // option focusable so its reason can be read, and ADR-0082 §1 reversed the same skip in Menu.
    it('marks them disabled and reaches them when arrowing', () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      expect(screen.getByRole('option', { name: 'Bravo' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-b');
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
    });

    it('shows the focus ring on a disabled active option', () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      const bravo = screen.getByRole('option', { name: 'Bravo' });
      expect(bravo).toHaveClass('ring-2');
      expect(bravo).not.toHaveClass('bg-accent');
    });

    it('reaches a disabled first and last option with Home and End', () => {
      const edges: ComboboxOption[] = [
        { value: 'a', label: 'Alpha', disabled: true },
        { value: 'b', label: 'Bravo' },
        { value: 'c', label: 'Charlie', disabled: true },
      ];
      render(<Harness options={edges} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'End' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
      fireEvent.keyDown(input(), { key: 'Home' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-a');
    });

    it('opens upwards onto a disabled last option, never Load more', () => {
      const tail: ComboboxOption[] = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Bravo', disabled: true },
      ];
      render(<Harness options={tail} hasMore onLoadMore={vi.fn()} />);
      fireEvent.keyDown(input(), { key: 'ArrowUp' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-b');
    });

    it('keeps Load more last in the sequence after disabled options', () => {
      render(<Harness options={withDisabled} hasMore onLoadMore={vi.fn()} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'End' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-load-more');
    });

    it('describes a disabled option by its reason without changing its name', () => {
      const reasoned: ComboboxOption[] = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Bravo', disabled: true, disabledReason: 'Archived calendar' },
      ];
      render(<Harness options={reasoned} />);
      openWithKeyboard();
      const bravo = screen.getByRole('option', { name: 'Bravo' });
      expect(bravo).toHaveAccessibleDescription('Archived calendar');
      expect(bravo).toHaveAccessibleName('Bravo');
    });

    it("prints a disabled option's reason inside the option, hidden from AT (ADR-0204)", () => {
      const reasoned: ComboboxOption[] = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Bravo', disabled: true, disabledReason: 'Archived calendar' },
      ];
      render(<Harness options={reasoned} />);
      openWithKeyboard();
      const reason = within(screen.getByRole('option', { name: 'Bravo' })).getByText(
        'Archived calendar',
      );
      expect(reason).toBeVisible();
      expect(reason).toHaveAttribute('aria-hidden', 'true');
    });

    it('does not describe an enabled option or an unreasoned disabled one', () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      for (const name of ['Alpha', 'Bravo', 'Charlie']) {
        expect(screen.getByRole('option', { name })).not.toHaveAttribute('aria-describedby');
      }
    });

    it('refuses Enter on a disabled option: no commit, stays open, reason announced', async () => {
      const onChange = vi.fn();
      const reasoned: ComboboxOption[] = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Bravo', disabled: true, disabledReason: 'Archived calendar' },
      ];
      render(<Harness options={reasoned} onChange={onChange} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      await vi.waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('Archived calendar'),
      );
    });

    it('announces "Unavailable." on Enter when no reason was given', async () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      fireEvent.keyDown(input(), { key: 'Enter' });
      await vi.waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('Unavailable.'),
      );
    });

    it('counts only choosable options, and says how many are unavailable', async () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      await vi.waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent(
          '2 results available, 1 unavailable.',
        ),
      );
    });

    it('keeps a value with whitespace addressable by id references', () => {
      const spaced: ComboboxOption[] = [
        { value: 'a b', label: 'Alpha', disabled: true, disabledReason: 'Archived calendar' },
        { value: 'c', label: 'Charlie' },
      ];
      render(<Harness options={spaced} />);
      openWithKeyboard();
      const active = input().getAttribute('aria-activedescendant') ?? '';
      expect(active).not.toMatch(/\s/);
      expect(document.getElementById(active)).toBe(screen.getByRole('option', { name: 'Alpha' }));
      const described = screen
        .getByRole('option', { name: 'Alpha' })
        .getAttribute('aria-describedby');
      expect(described).not.toMatch(/\s/);
      expect(document.getElementById(described ?? '')).toHaveTextContent('Archived calendar');
    });

    it('announces the reason when a disabled option is pressed', async () => {
      const onChange = vi.fn();
      const reasoned: ComboboxOption[] = [
        { value: 'a', label: 'Alpha', disabled: true, disabledReason: 'Archived calendar' },
        { value: 'c', label: 'Charlie' },
      ];
      render(<Harness options={reasoned} onChange={onChange} />);
      openWithKeyboard();
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Alpha' }));
      expect(onChange).not.toHaveBeenCalled();
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      await vi.waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('Archived calendar'),
      );
    });

    it('does not claim "No matches." when every option is disabled', async () => {
      const allOff: ComboboxOption[] = [
        { value: 'a', label: 'Alpha', disabled: true },
        { value: 'b', label: 'Bravo', disabled: true },
      ];
      render(<Harness options={allOff} />);
      openWithKeyboard();
      expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
      expect(screen.getAllByText('No options available.').length).toBeGreaterThan(0);
      await vi.waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent('No options available.'),
      );
    });

    it('walks grouped options in DOM order across groups, disabled ones included', () => {
      const grouped: ComboboxOption[] = [
        { value: 'p1', label: 'P1', group: 'project' },
        { value: 'o1', label: 'O1', group: 'org', disabled: true },
        { value: 'u', label: 'Ungrouped' },
        { value: 'o2', label: 'O2', group: 'org' },
      ];
      render(<Harness options={grouped} />);
      openWithKeyboard();
      const seen = [input().getAttribute('aria-activedescendant')];
      for (let i = 0; i < 3; i++) {
        fireEvent.keyDown(input(), { key: 'ArrowDown' });
        seen.push(input().getAttribute('aria-activedescendant'));
      }
      // Ungrouped first, then each group in first-seen order.
      expect(seen).toEqual(['cb-option-u', 'cb-option-p1', 'cb-option-o1', 'cb-option-o2']);
    });

    it('still activates Load more with Enter after disabled rows', () => {
      const onLoadMore = vi.fn();
      const onChange = vi.fn();
      render(
        <Harness options={withDisabled} hasMore onLoadMore={onLoadMore} onChange={onChange} />,
      );
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'End' });
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores a pointer press on them', () => {
      const onChange = vi.fn();
      render(<Harness options={withDisabled} onChange={onChange} />);
      openWithKeyboard();
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Bravo' }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('the current value', () => {
    it('renders as selected even when it is outside the filtered page', () => {
      render(<Harness value="zzz" selectedLabel="Winter shutdown" options={[OPTIONS[0]!]} />);
      expect(input()).toHaveValue('Winter shutdown');
      openWithKeyboard();
      expect(screen.getByRole('option', { name: 'Winter shutdown' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('falls back to a placeholder rather than blanking when its label is unknown', () => {
      const { rerender } = render(<Harness value="zzz" loading />);
      expect(input()).toHaveValue('Loading…');
      rerender(<Harness value="zzz" />);
      expect(input()).toHaveValue('Unavailable');
    });

    it('offers the empty option and emits an empty value for it', () => {
      const onChange = vi.fn();
      render(
        <Harness value="a" emptyOption={{ label: 'Inherit from plan' }} onChange={onChange} />,
      );
      openWithKeyboard();
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Inherit from plan' }));
      expect(onChange).toHaveBeenCalledWith('');
    });

    // A native `<select value="">` always showed the matching option's text. Blanking the field
    // instead would lose the control's state (WCAG 4.1.2) — and "inherit"/"none" is the DEFAULT
    // for most calendar pickers, so it is the most common state of all.
    it('shows the empty option’s label when it is the selection, and keeps it selected', () => {
      render(<Harness value="" emptyOption={{ label: 'None (all days work)' }} />);
      expect(input()).toHaveValue('None (all days work)');
      openWithKeyboard();
      const empty = screen.getByRole('option', { name: 'None (all days work)' });
      expect(empty).toHaveAttribute('aria-selected', 'true');
      // Exactly one row — the empty option must not be duplicated by the "current value outside
      // the page" fallback.
      expect(screen.getAllByRole('option', { name: 'None (all days work)' })).toHaveLength(1);
    });

    it('still blanks (for the placeholder) when there is no empty option', () => {
      render(<Harness value="" placeholder="Search calendars…" />);
      expect(input()).toHaveValue('');
      expect(input()).toHaveAttribute('placeholder', 'Search calendars…');
    });
  });

  describe('list states', () => {
    it('shows a loading row and marks the field busy', () => {
      render(<Harness options={[]} loading />);
      openWithKeyboard();
      expect(input()).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('shows the empty message instead of a blank popover', () => {
      render(<Harness options={[]} emptyMessage="No calendars match “xyz”." />);
      openWithKeyboard();
      expect(screen.getByText('No calendars match “xyz”.')).toBeInTheDocument();
    });

    it('shows an error row when the load failed', () => {
      render(<Harness options={[]} errored />);
      openWithKeyboard();
      expect(screen.getByText('Could not load options.')).toBeInTheDocument();
    });

    it('pages with "Load more" WITHOUT closing the list or changing the selection', () => {
      const onLoadMore = vi.fn();
      const onChange = vi.fn();
      render(<Harness hasMore onLoadMore={onLoadMore} onChange={onChange} />);
      openWithKeyboard();
      fireEvent.pointerDown(screen.getByRole('option', { name: 'Load more results' }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      expect(onChange).not.toHaveBeenCalled();
    });

    // "Load more" is the ONLY route to page 2+ of a server-searched library, so a pointer-only
    // affordance would strand keyboard users on the first page (WCAG 2.1.1 Keyboard).
    it('reaches and activates "Load more" by keyboard alone, as the last row', () => {
      const onLoadMore = vi.fn();
      const onChange = vi.fn();
      render(<Harness hasMore onLoadMore={onLoadMore} onChange={onChange} />);
      openWithKeyboard();
      fireEvent.keyDown(input(), { key: 'End' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-load-more');
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      // Loading a page neither commits a value nor closes the popup.
      expect(onChange).not.toHaveBeenCalled();
      expect(input()).toHaveAttribute('aria-expanded', 'true');
    });

    it('opens upwards onto the last real option, never the "Load more" action', () => {
      render(<Harness hasMore onLoadMore={vi.fn()} />);
      fireEvent.keyDown(input(), { key: 'ArrowUp' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
    });
  });

  it('announces the result count so a filtered list is not silently smaller', async () => {
    render(<Harness />);
    openWithKeyboard();
    // The announcer clears then sets on the next frame; assert on the region once it settles.
    await vi.waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('3 results available.'),
    );
  });

  it('selects on pointer press', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openWithKeyboard();
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Charlie' }));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no axe violations, open or closed', async () => {
    const { container } = render(<Harness value="b" />);
    expect((await axe(container)).violations).toEqual([]);
    openWithKeyboard();
    expect((await axe(container)).violations).toEqual([]);
  });
});
