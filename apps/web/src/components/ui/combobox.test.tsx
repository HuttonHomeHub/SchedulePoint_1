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

    it('marks them disabled and skips them when arrowing', () => {
      render(<Harness options={withDisabled} />);
      openWithKeyboard();
      expect(screen.getByRole('option', { name: 'Bravo' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      expect(input()).toHaveAttribute('aria-activedescendant', 'cb-option-c');
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
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Load more' }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      expect(input()).toHaveAttribute('aria-expanded', 'true');
      expect(onChange).not.toHaveBeenCalled();
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
